import '../lib/env.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import { stdin, stdout } from 'process';
import { supabase } from '../lib/supabase.js';

// Usage: npm run pick -- <runId>
//        npm run pick -- latest
//
// For each slot in the run, downloads all 4 variants from Supabase Storage
// to a temp dir, opens them in macOS Quick Look, and prompts you for a
// 1-4 selection. The chosen variant gets `picked = true` in the DB; the
// others stay false. Re-runnable — picking again overrides the previous
// pick for that slot.

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: npm run pick -- <runId>  (or "latest")');
  process.exit(1);
}

type VariantRow = {
  id: number;
  run_id: string;
  slot: string;
  variant_index: number;
  storage_path: string;
  picked: boolean;
};

async function resolveRunId(input: string): Promise<string> {
  if (input !== 'latest') return input;
  const { data, error } = await supabase
    .from('magazine_image_variants')
    .select('run_id, generated_at')
    .order('generated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('No image variants found in any run.');
  return data[0]!.run_id as string;
}

async function loadVariants(runId: string): Promise<VariantRow[]> {
  const { data, error } = await supabase
    .from('magazine_image_variants')
    .select('id, run_id, slot, variant_index, storage_path, picked')
    .eq('run_id', runId)
    .order('slot', { ascending: true })
    .order('variant_index', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as VariantRow[];
}

async function downloadToTmp(variant: VariantRow, tmpDir: string): Promise<string> {
  const { data, error } = await supabase.storage.from('magazine-assets').download(variant.storage_path);
  if (error) throw new Error(`Download ${variant.storage_path}: ${error.message}`);
  const localPath = join(tmpDir, `${variant.slot}__variant-${variant.variant_index}.png`);
  const arrayBuffer = await data.arrayBuffer();
  writeFileSync(localPath, Buffer.from(arrayBuffer));
  return localPath;
}

function openInQuickLook(paths: string[]): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn('qlmanage', ['-p', ...paths], { stdio: 'ignore' });
    proc.on('close', () => resolve());
    // Don't await — Quick Look stays open until user closes. We resolve
    // when child exits OR when user has answered the prompt.
  });
}

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(prompt);
    stdin.once('data', (chunk) => resolve(chunk.toString().trim()));
  });
}

async function setPick(variantId: number, runId: string, slot: string): Promise<void> {
  // Clear previous pick on this slot, then set the new one.
  await supabase
    .from('magazine_image_variants')
    .update({ picked: false, picked_at: null })
    .eq('run_id', runId)
    .eq('slot', slot);

  const { error } = await supabase
    .from('magazine_image_variants')
    .update({ picked: true, picked_at: new Date().toISOString() })
    .eq('id', variantId);
  if (error) throw new Error(`Set pick failed: ${error.message}`);
}

async function main() {
  const runId = await resolveRunId(arg!);
  console.log(`[pick] run ${runId.slice(0, 8)}…`);

  const variants = await loadVariants(runId);
  if (variants.length === 0) {
    console.error(`No variants in run ${runId}. Run "npm run imagine -- ${runId}" first.`);
    process.exit(1);
  }

  // Group by slot
  const bySlot = new Map<string, VariantRow[]>();
  for (const v of variants) {
    const list = bySlot.get(v.slot) ?? [];
    list.push(v);
    bySlot.set(v.slot, list);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'magazine-pick-'));
  console.log(`[pick] downloading variants to ${tmpDir}\n`);

  stdin.setEncoding('utf-8');
  stdin.resume();

  let openProc: ReturnType<typeof spawn> | null = null;

  try {
    for (const [slot, slotVariants] of bySlot) {
      const localPaths: string[] = [];
      for (const v of slotVariants) {
        localPaths.push(await downloadToTmp(v, tmpDir));
      }

      console.log(`━━━ slot: ${slot} ━━━`);
      slotVariants.forEach((v, i) => {
        const tag = v.picked ? ' (current pick)' : '';
        console.log(`  [${i + 1}] variant ${v.variant_index}${tag}`);
      });

      // Close any prior Quick Look window
      if (openProc) {
        openProc.kill();
        openProc = null;
      }
      openProc = spawn('qlmanage', ['-p', ...localPaths], { stdio: 'ignore' });

      const answer = await ask(`  Pick (1-${slotVariants.length}, or s to skip, or q to quit): `);
      const lower = answer.toLowerCase();

      if (lower === 'q') {
        console.log('[pick] quit — picks saved up to this point.');
        break;
      }
      if (lower === 's' || lower === '') {
        console.log(`[pick]   skipped ${slot}\n`);
        continue;
      }

      const choice = parseInt(answer, 10);
      if (!Number.isInteger(choice) || choice < 1 || choice > slotVariants.length) {
        console.log(`[pick]   invalid input '${answer}', skipping ${slot}\n`);
        continue;
      }

      const picked = slotVariants[choice - 1]!;
      await setPick(picked.id, runId, slot);
      console.log(`[pick]   ✓ slot ${slot} → variant ${picked.variant_index}\n`);
    }
  } finally {
    if (openProc) openProc.kill();
    rmSync(tmpDir, { recursive: true, force: true });
    stdin.pause();
  }

  // Summary
  const final = await loadVariants(runId);
  const picked = final.filter((v) => v.picked);
  console.log(`\n[pick] DONE — ${picked.length} of ${bySlot.size} slots picked.`);
  if (picked.length === bySlot.size) {
    console.log(`Next: npm run publish -- ${runId}`);
  } else {
    console.log(`Re-run "npm run pick -- ${runId}" to fill in remaining slots.`);
  }
}

main().catch((e) => {
  console.error('[pick] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
