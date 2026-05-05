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

function placeholderAssetPaths(slug: string): MagazineIssueManifest['assetPaths'] {
  // V1 placeholder. Replace with real Supabase Storage URLs after Step 3+4.
  const base = `placeholder://${slug}`;
  return {
    coverStart: `${base}/cover-start.png`,
    coverEnd: `${base}/cover-end.png`,
    coverMotion: `${base}/cover-motion.mp4`,
    coverFrames: `${base}/cover-frames/`,
    trendCards: [
      `${base}/trend-1.png`,
      `${base}/trend-2.png`,
      `${base}/trend-3.png`,
    ],
    curatorCards: [
      `${base}/curator-1.png`,
      `${base}/curator-2.png`,
    ],
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
  console.log(`[publish] using placeholder asset paths — wire image executor in Step 3 to replace.`);

  const result = await runPublish({
    runConfig: config,
    draft,
    prompts,
    research,
    volume,
    assetPaths: placeholderAssetPaths(draft.cover.slug),
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
