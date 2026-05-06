import '../lib/env.js';
import { supabase } from '../lib/supabase.js';
import { archiveSources, archiveStats } from '../lib/archive.js';
import type { Source } from '../orchestrator/types.js';

// One-time backfill: read every research step we've ever executed and
// merge its sources into magazine_search_archive. Recovers the ~292
// sources from the unconstrained search run we paid for before we
// learned to use max_uses.
//
// Safe to re-run — upsert dedupes by URL.
//
// Usage: npm run backfill-archive

async function main() {
  const before = await archiveStats();
  console.log(`[backfill] archive currently has ${before.total} sources`);

  // Pull every research step that has output (status complete or running
  // with output payload). Some failed runs still hold partial source lists.
  const { data, error } = await supabase
    .from('magazine_run_steps')
    .select('run_id, output, status, created_at')
    .eq('step', 'research')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Read research steps: ${error.message}`);

  let totalInserted = 0;
  let totalUpdated = 0;
  let runsProcessed = 0;
  let runsSkipped = 0;

  for (const row of data ?? []) {
    const output = row.output as { sources?: Source[]; researchNotes?: string } | null;
    if (!output?.sources || output.sources.length === 0) {
      runsSkipped++;
      continue;
    }

    // Best-effort keyword tagging from the research notes if present.
    // In V1 most prior runs don't have a stored seed trend, so use a
    // generic keyword set that overlaps with seasonal fashion vocabulary.
    const keywords = (output.researchNotes ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .slice(0, 8);

    if (keywords.length === 0) {
      keywords.push('fashion', 'trend', 'returning');
    }

    const { inserted, updated } = await archiveSources({
      sources: output.sources,
      trendKeywords: keywords,
      runId: row.run_id as string,
    });

    totalInserted += inserted;
    totalUpdated += updated;
    runsProcessed++;
    console.log(
      `[backfill] run ${(row.run_id as string).slice(0, 8)}…  ` +
      `+${inserted} new, ${updated} refreshed (${output.sources.length} total)`,
    );
  }

  const after = await archiveStats();
  console.log(`\n[backfill] DONE`);
  console.log(`  runs processed:  ${runsProcessed}`);
  console.log(`  runs skipped:    ${runsSkipped} (no sources)`);
  console.log(`  rows inserted:   ${totalInserted}`);
  console.log(`  rows refreshed:  ${totalUpdated}`);
  console.log(`  archive total:   ${before.total} → ${after.total}`);
}

main().catch((e) => {
  console.error('[backfill] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
