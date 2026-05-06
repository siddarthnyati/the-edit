import { supabase } from './supabase.js';
import type { Source } from '../orchestrator/types.js';

export type ArchiveRow = {
  url: string;
  title: string;
  publisher: string;
  signal_type: Source['signalType'];
  trend_keywords: string[];
  raw_snippet: string | null;
  first_seen_at: string;
  last_seen_at: string;
  source_run_ids: string[];
};

// Upsert a batch of sources. New URLs get inserted; existing URLs get
// last_seen_at refreshed and the new run_id + keywords merged in.
export async function archiveSources(args: {
  sources: Source[];
  trendKeywords: string[];
  runId: string;
  rawSnippets?: Record<string, string>;
}): Promise<{ inserted: number; updated: number }> {
  if (args.sources.length === 0) return { inserted: 0, updated: 0 };

  // Find which URLs already exist so we know insert vs update counts.
  const urls = args.sources.map((s) => s.url);
  const { data: existing } = await supabase
    .from('magazine_search_archive')
    .select('url, trend_keywords, source_run_ids')
    .in('url', urls);

  const existingMap = new Map<string, { trend_keywords: string[]; source_run_ids: string[] }>();
  for (const row of existing ?? []) {
    existingMap.set(row.url as string, {
      trend_keywords: (row.trend_keywords as string[]) ?? [],
      source_run_ids: (row.source_run_ids as string[]) ?? [],
    });
  }

  const now = new Date().toISOString();
  const rows = args.sources.map((s) => {
    const prior = existingMap.get(s.url);
    const mergedKeywords = Array.from(new Set([...(prior?.trend_keywords ?? []), ...args.trendKeywords]));
    const mergedRunIds = Array.from(new Set([...(prior?.source_run_ids ?? []), args.runId]));
    return {
      url: s.url,
      title: s.title,
      publisher: s.publisher,
      signal_type: s.signalType,
      trend_keywords: mergedKeywords,
      raw_snippet: args.rawSnippets?.[s.url] ?? null,
      first_seen_at: prior ? undefined : now,
      last_seen_at: now,
      source_run_ids: mergedRunIds,
    };
  });

  const { error } = await supabase
    .from('magazine_search_archive')
    .upsert(rows, { onConflict: 'url' });

  if (error) throw new Error(`Archive upsert failed: ${error.message}`);

  let inserted = 0;
  let updated = 0;
  for (const s of args.sources) {
    if (existingMap.has(s.url)) updated++;
    else inserted++;
  }
  return { inserted, updated };
}

// Query the archive for sources matching any of the seed trend's keywords,
// seen within the last `freshDays` days. Returns up to `limit` rows ordered
// by recency.
export async function findFreshSources(args: {
  trendKeywords: string[];
  freshDays: number;
  limit?: number;
}): Promise<ArchiveRow[]> {
  const cutoff = new Date(Date.now() - args.freshDays * 86400_000).toISOString();
  const limit = args.limit ?? 30;

  const { data, error } = await supabase
    .from('magazine_search_archive')
    .select('*')
    .overlaps('trend_keywords', args.trendKeywords)
    .gte('last_seen_at', cutoff)
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Archive query failed: ${error.message}`);
  return (data ?? []) as ArchiveRow[];
}

export async function archiveStats(): Promise<{ total: number; lastSeen: string | null }> {
  const { count, error } = await supabase
    .from('magazine_search_archive')
    .select('*', { count: 'exact', head: true });
  if (error) throw new Error(error.message);

  const { data: latest } = await supabase
    .from('magazine_search_archive')
    .select('last_seen_at')
    .order('last_seen_at', { ascending: false })
    .limit(1);

  return {
    total: count ?? 0,
    lastSeen: (latest?.[0]?.last_seen_at as string | undefined) ?? null,
  };
}
