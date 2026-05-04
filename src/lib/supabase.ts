import { createClient } from '@supabase/supabase-js';
import type { MagazineIssueManifest, MagazineRunStep } from '../orchestrator/types.js';

const url = process.env['SUPABASE_URL'];
const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!url || !key) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

export const supabase = createClient(url, key);

export async function persistStep(step: MagazineRunStep): Promise<void> {
  const { error } = await supabase.from('magazine_run_steps').upsert(
    {
      run_id: step.runId,
      step: step.step,
      status: step.status,
      input: step.input,
      output: step.output,
      sources: step.sources,
      model_provider: step.modelProvider,
      model_name: step.modelName,
      estimated_cost_usd: step.estimatedCostUsd,
      error: step.error,
      created_at: step.createdAt,
      completed_at: step.completedAt,
    },
    { onConflict: 'run_id,step' },
  );

  if (error) throw new Error(`Supabase persist failed: ${error.message}`);
}

export async function persistManifest(manifest: MagazineIssueManifest): Promise<void> {
  const { error } = await supabase.from('magazine_issue_manifests').insert({
    slug: manifest.slug,
    volume: manifest.volume,
    publish_date: manifest.publishDate,
    date_range: manifest.dateRange,
    trend: manifest.trend,
    trend_keywords: manifest.trendKeywords,
    era_reference: manifest.eraReference,
    audience_tracks: manifest.audienceTracks,
    cover_treatment: manifest.coverTreatment,
    asset_paths: manifest.assetPaths,
    source_summary: manifest.sourceSummary,
    qa_status: manifest.qaStatus,
  });

  if (error) throw new Error(`Supabase manifest persist failed: ${error.message}`);
}
