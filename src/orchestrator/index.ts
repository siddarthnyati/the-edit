import { randomUUID } from 'crypto';
import { persistStep } from '../lib/supabase.js';
import { runResearch } from '../executors/research.js';
import { runRank } from '../executors/rank.js';
import { runEdit } from '../executors/edit.js';
import { runPrompt } from '../executors/prompt.js';
import { runQA } from '../executors/qa.js';
import type { OrchestrationState, RunConfig, MagazineIssueManifest } from './types.js';

// ---------------------------------------------------------------------------
// Entry point: `npm run draft`
// ---------------------------------------------------------------------------

async function main() {
  const seedTrend = process.env['MAGAZINE_SEED_TREND'] || undefined;
  const config: RunConfig = {
    runId: randomUUID(),
    ...(seedTrend !== undefined && { seedTrend }),
    budgetUsd: parseFloat(process.env['MAGAZINE_BUDGET_USD'] ?? '4.00'),
    dateRange: currentWeekRange(),
    audienceTracks: ['man', 'woman', 'non-binary'],
  };

  console.log(`\n[orchestrator] run ${config.runId} — ${config.dateRange}`);
  console.log(`[orchestrator] budget $${config.budgetUsd} | seed: ${config.seedTrend ?? 'none'}\n`);

  const state: OrchestrationState = {
    config,
    completedSteps: [],
    totalCostUsd: 0,
  };

  // ── 1. Research ────────────────────────────────────────────────────────────
  const research = await runStep('research', state, async () =>
    runResearch({ runConfig: config, priorIssueSlugs: [] })
  );

  // ── 2. Rank ────────────────────────────────────────────────────────────────
  const ranked = await runStep('rank', state, async () =>
    runRank({ runConfig: config, research })
  );

  // ── APPROVAL GATE 1: trend winner ─────────────────────────────────────────
  await approvalGate('trend winner', config.runId, {
    winning: ranked.winningTrend,
    rationale: ranked.rationale,
    stories: ranked.trendStories.map((s) => s.angle),
  });

  // ── 3. Edit ────────────────────────────────────────────────────────────────
  const draft = await runStep('edit', state, async () =>
    runEdit({ runConfig: config, ranked, volume: nextVolume() })
  );

  // ── 4. Prompt suite ────────────────────────────────────────────────────────
  const prompts = await runStep('prompt', state, async () =>
    runPrompt({ draft, ranked })
  );

  // ── 5. QA ──────────────────────────────────────────────────────────────────
  const qa = await runStep('qa', state, async () =>
    runQA({ runConfig: config, draft, prompts, research, stepCostsSoFar: state.totalCostUsd })
  );

  if (qa.verdict !== 'approve') {
    console.error('\n[orchestrator] QA verdict:', qa.verdict);
    console.error('[orchestrator] Revision requirements:');
    qa.revisionRequirements.forEach((r) => {
      console.error(`  ${r.section}: ${r.issue} → ${r.requirement}`);
    });
    console.error('\n[orchestrator] Run blocked. Fix the above issues and re-run.');
    process.exit(1);
  }

  console.log('\n[orchestrator] QA passed.\n');

  // ── APPROVAL GATE 2: issue draft + asset prompts ───────────────────────────
  await approvalGate('issue draft', config.runId, {
    cover: draft.cover,
    vogueSelfCheck: draft.vogueSelfCheck,
    qaVerdict: qa.verdict,
    qaSummary: qa.summary,
    totalCostUsd: state.totalCostUsd,
  });

  // ── APPROVAL GATE 3: publish ───────────────────────────────────────────────
  // The publisher executor is intentionally not wired here in V1.
  // After both approval gates above are confirmed, run:
  //   npm run publish -- --run-id <runId>
  // That command will call runPublish() with the approved draft and asset paths.

  console.log('[orchestrator] Draft complete. Awaiting publish approval.');
  console.log('[orchestrator] Run ID:', config.runId);
  console.log('[orchestrator] Total estimated cost: $' + state.totalCostUsd.toFixed(4));
  console.log('[orchestrator] Issue slug:', draft.cover.slug);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runStep<T>(
  step: OrchestrationState['completedSteps'][number],
  state: OrchestrationState,
  fn: () => Promise<T>,
): Promise<T> {
  const createdAt = new Date().toISOString();

  await persistStep({
    runId: state.config.runId,
    step,
    status: 'running',
    input: null,
    output: null,
    sources: [],
    createdAt,
  });

  try {
    console.log(`[${step}] starting…`);
    const output = await fn();

    await persistStep({
      runId: state.config.runId,
      step,
      status: 'complete',
      input: null,
      output,
      sources: [],
      createdAt,
      completedAt: new Date().toISOString(),
    });

    state.completedSteps.push(step);
    return output;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await persistStep({
      runId: state.config.runId,
      step,
      status: 'failed',
      input: null,
      output: null,
      sources: [],
      error,
      createdAt,
      completedAt: new Date().toISOString(),
    });

    console.error(`[${step}] failed: ${error}`);
    throw err;
  }
}

async function approvalGate(label: string, runId: string, summary: unknown): Promise<void> {
  // V1: print the approval payload and pause. In V2, this will write a Supabase
  // approval record and wait for a webhook or manual resume command.
  console.log(`\n━━━ APPROVAL GATE: ${label} ━━━`);
  console.log(JSON.stringify(summary, null, 2));
  console.log('━━━ Review the above and press Enter to continue, or Ctrl+C to abort. ━━━\n');

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });

  await persistStep({
    runId,
    step: 'approval',
    status: 'complete',
    input: summary,
    output: { approved: true, approvedAt: new Date().toISOString() },
    sources: [],
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });
}

function currentWeekRange(): string {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `${fmt(start)} to ${fmt(end)}`;
}

function nextVolume(): number {
  // TODO: read last volume from Supabase issue archive and increment.
  // Hard-coded to 19 for bootstrap — update after first real publish.
  return 19;
}

main().catch((err) => {
  console.error('[orchestrator] fatal:', err);
  process.exit(1);
});
