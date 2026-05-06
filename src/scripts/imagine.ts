import '../lib/env.js';
import { supabase } from '../lib/supabase.js';
import { runImagine } from '../executors/imagine.js';
import { loadPriorCost } from '../lib/cost.js';
import type { PromptOutput } from '../executors/prompt.js';

// Usage: npm run imagine -- <runId>
//        npm run imagine -- latest
//
// Reads the prompt step output from a previously-completed run and generates
// 4 variants per slot via Gemini 2.5 Flash Image. Variants land in the
// magazine-assets Supabase Storage bucket and are indexed in
// magazine_image_variants.
//
// After this finishes, run:  npm run pick -- <runId>

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: npm run imagine -- <runId>');
  console.error('       npm run imagine -- latest');
  process.exit(1);
}

async function resolveRunId(input: string): Promise<string> {
  if (input !== 'latest') return input;
  const { data, error } = await supabase
    .from('magazine_run_steps')
    .select('run_id, created_at')
    .eq('step', 'prompt')
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('No completed runs with a prompt step found.');
  return data[0]!.run_id as string;
}

async function loadPromptStep(runId: string): Promise<PromptOutput> {
  const { data, error } = await supabase
    .from('magazine_run_steps')
    .select('output')
    .eq('run_id', runId)
    .eq('step', 'prompt')
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error(`Run ${runId.slice(0, 8)}… has no complete 'prompt' step.`);
  }
  return data[0]!.output as PromptOutput;
}

async function main() {
  const runId = await resolveRunId(arg!);
  console.log(`[imagine] resolving run ${runId.slice(0, 8)}…`);

  // Seed the cost tracker with what the draft script already spent on
  // this run, so the hard cap covers the full pipeline not just imagine.
  await loadPriorCost(runId);

  const prompts = await loadPromptStep(runId);
  const result = await runImagine({ runId, prompts });

  console.log(`\n[imagine] DONE`);
  console.log(`  variants generated: ${result.totalVariants}`);
  console.log(`  cost:               $${result.totalCostUsd.toFixed(4)}`);
  console.log(`  slots:              ${result.slotsGenerated.join(', ')}`);
  console.log(`\nNext: npm run pick -- ${runId}`);
}

main().catch((e) => {
  console.error('[imagine] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
