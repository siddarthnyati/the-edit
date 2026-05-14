import { createClient } from '@supabase/supabase-js';
import type { MagazineIssueManifest, MagazineRunStep } from '../orchestrator/types.js';

type SupabaseClient = ReturnType<typeof createClient<any>>;

let cachedSupabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!cachedSupabase) {
    const url = process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];

    if (!url || !key) {
      throw new Error('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }

    cachedSupabase = createClient<any>(url, key);
  }

  return cachedSupabase;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabase(), prop, receiver);
  },
});

export async function persistStep(step: MagazineRunStep): Promise<void> {
  const row = {
    run_id: step.runId,
    step: step.step,
    status: step.status,
    input: step.input,
    output: step.output,
    sources: step.sources,
    model_provider: step.modelProvider ?? null,
    model_name: step.modelName ?? null,
    estimated_cost_usd: step.estimatedCostUsd ?? null,
    error: step.error ?? null,
    retry_count: step.retryCount ?? 0,
    recoverable: step.recoverable ?? null,
    blocked_reason: step.blockedReason ?? null,
    raw_error_summary: step.rawErrorSummary ?? null,
    source_count: step.sourceCount ?? null,
    publisher_count: step.publisherCount ?? null,
    created_at: step.createdAt,
    completed_at: step.completedAt ?? null,
  };

  const { error } = await getSupabase().from('magazine_run_steps').upsert(row, { onConflict: 'run_id,step' });

  if (!error) return;

  const message = error.message.toLowerCase();
  if (
    !message.includes('retry_count') &&
    !message.includes('recoverable') &&
    !message.includes('blocked_reason') &&
    !message.includes('raw_error_summary') &&
    !message.includes('source_count') &&
    !message.includes('publisher_count')
  ) {
    throw new Error(`Supabase persist failed: ${error.message}`);
  }

  const fallbackRow = { ...row };
  delete (fallbackRow as Partial<typeof row>).retry_count;
  delete (fallbackRow as Partial<typeof row>).recoverable;
  delete (fallbackRow as Partial<typeof row>).blocked_reason;
  delete (fallbackRow as Partial<typeof row>).raw_error_summary;
  delete (fallbackRow as Partial<typeof row>).source_count;
  delete (fallbackRow as Partial<typeof row>).publisher_count;

  const { error: fallbackError } = await getSupabase()
    .from('magazine_run_steps')
    .upsert(fallbackRow, { onConflict: 'run_id,step' });

  if (fallbackError) throw new Error(`Supabase persist failed: ${fallbackError.message}`);
}

export async function persistManifest(manifest: MagazineIssueManifest): Promise<void> {
  const row = {
    run_id: manifest.runId,
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
    issue_payload: manifest.issuePayload,
  };

  const { error } = await getSupabase().from('magazine_issue_manifests').insert(row);

  if (!error) return;

  const message = error.message.toLowerCase();
  if (!message.includes('issue_payload') && !message.includes('run_id')) {
    throw new Error(`Supabase manifest persist failed: ${error.message}`);
  }

  const fallbackRow = {
    ...row,
    asset_paths: {
      ...manifest.assetPaths,
      issuePayload: manifest.issuePayload,
      runId: manifest.runId,
    },
  };
  delete (fallbackRow as Partial<typeof row>).issue_payload;
  delete (fallbackRow as Partial<typeof row>).run_id;

  const { error: fallbackError } = await getSupabase()
    .from('magazine_issue_manifests')
    .insert(fallbackRow);

  if (fallbackError) {
    throw new Error(`Supabase manifest persist failed: ${fallbackError.message}`);
  }
}
