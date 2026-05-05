import '../lib/env.js';
import { supabase } from '../lib/supabase.js';
import { runPublish } from '../executors/publish.js';
import type { RunConfig, MagazineIssueManifest } from '../orchestrator/types.js';
import type { ResearchOutput } from '../executors/research.js';
import type { EditOutput } from '../executors/edit.js';
import type { PromptOutput } from '../executors/prompt.js';

// Usage: npm run publish -- <runId>
//
// Reads the approved draft + prompt suite from a previously-completed run,
// then writes the final manifest to magazine_issue_manifests.
//
// V1 limitation: assetPaths come from a placeholder template until Step 3
// (the image executor) and Step 4 (the variant picker) ship. Once those
// are live, this script will read the picked variant URLs from
// magazine_image_variants instead of using placeholders.

const runId = process.argv[2];
if (!runId) {
  console.error('Usage: npm run publish -- <runId>');
  console.error('       npm run publish -- latest');
  process.exit(1);
}

async function resolveRunId(input: string): Promise<string> {
  if (input !== 'latest') return input;
  const { data, error } = await supabase
    .from('magazine_run_steps')
    .select('run_id, created_at')
    .eq('step', 'qa')
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('No completed runs with a QA step found.');
  return data[0]!.run_id as string;
}

async function loadStep<T>(rid: string, step: string): Promise<T> {
  const { data, error } = await supabase
    .from('magazine_run_steps')
    .select('output, status, error')
    .eq('run_id', rid)
    .eq('step', step)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error(`Run ${rid.slice(0, 8)}… has no complete '${step}' step. Run draft first.`);
  }
  return data[0]!.output as T;
}

async function nextVolume(): Promise<number> {
  const { data, error } = await supabase
    .from('magazine_issue_manifests')
    .select('volume')
    .order('volume', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const last = data?.[0]?.volume;
  return typeof last === 'number' ? last + 1 : 19;
}

async function loadPickedAssetPaths(rid: string): Promise<MagazineIssueManifest['assetPaths']> {
  const { data, error } = await supabase
    .from('magazine_image_variants')
    .select('slot, storage_path')
    .eq('run_id', rid)
    .eq('picked', true);

  if (error) throw new Error(`Loading picked variants: ${error.message}`);

  const bySlot = new Map<string, string>();
  for (const row of data ?? []) {
    bySlot.set(row.slot as string, row.storage_path as string);
  }

  const required = ['cover-start', 'cover-end', 'trend-1', 'trend-2', 'trend-3', 'curator-1', 'curator-2'];
  const missing = required.filter((s) => !bySlot.has(s));
  if (missing.length > 0) {
    throw new Error(
      `Cannot publish: missing picks for slots [${missing.join(', ')}]. ` +
      `Run "npm run imagine -- ${rid}" then "npm run pick -- ${rid}" first.`,
    );
  }

  // Storage paths are bucket-relative; turn them into resolvable URLs.
  // For a private bucket, you'd use signed URLs at read-time. For V1, we
  // store the bucket-relative path and let the app backend sign on demand.
  const url = (slot: string) => `magazine-assets/${bySlot.get(slot)}`;

  return {
    coverStart: url('cover-start'),
    coverEnd: url('cover-end'),
    coverMotion: '', // V1: no motion (Kling deferred to V2)
    coverFrames: '', // V1: covered by coverStart + coverEnd as a 2-frame sequence
    trendCards: [url('trend-1'), url('trend-2'), url('trend-3')],
    curatorCards: [url('curator-1'), url('curator-2')],
  };
}

async function main() {
  const rid = await resolveRunId(runId!);
  console.log(`[publish] resolving run ${rid.slice(0, 8)}…`);

  // Load the artifacts the publisher needs from the run record.
  const research = await loadStep<ResearchOutput>(rid, 'research');
  const draft = await loadStep<EditOutput>(rid, 'edit');
  const prompts = await loadStep<PromptOutput>(rid, 'prompt');

  // Confirm QA approved before publishing.
  const qa = await loadStep<{ verdict: 'approve' | 'revise' | 'reject' }>(rid, 'qa');
  if (qa.verdict !== 'approve') {
    console.error(`[publish] BLOCKED: QA verdict was '${qa.verdict}', not 'approve'. ` +
      `Re-run draft after fixing the revision requirements.`);
    process.exit(1);
  }

  const config: RunConfig = {
    runId: rid,
    budgetUsd: 2,
    dateRange: 'unknown',
    audienceTracks: ['man', 'woman', 'non-binary'],
  };

  const volume = await nextVolume();
  console.log(`[publish] next volume: ${volume}`);

  const assetPaths = await loadPickedAssetPaths(rid);
  console.log(`[publish] all 7 slot picks resolved.`);

  const result = await runPublish({
    runConfig: config,
    draft,
    prompts,
    research,
    volume,
    assetPaths,
  });

  console.log(`\n[publish] DONE`);
  console.log(`  slug:         ${result.manifest.slug}`);
  console.log(`  volume:       ${result.manifest.volume}`);
  console.log(`  publishedAt:  ${result.publishedAt}`);
  console.log(`  trend:        ${result.manifest.trend}`);
  console.log(`\nView in Supabase: select * from magazine_issue_manifests where slug = '${result.manifest.slug}';`);
}

main().catch((e) => {
  console.error('[publish] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
