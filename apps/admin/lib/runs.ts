import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { loadRunArtifacts, publishRunToApp, REQUIRED_SLOTS } from '@/lib/magazine';
import { runResearch, type ResearchOutput } from '../../../src/executors/research';
import { runRank, type RankOutput } from '../../../src/executors/rank';
import { runEdit, type EditOutput } from '../../../src/executors/edit';
import { runPrompt, type PromptOutput } from '../../../src/executors/prompt';
import { runQA } from '../../../src/executors/qa';
import { persistStep } from '../../../src/lib/supabase';
import { endStep, getStepCost, getTotalCost, loadPriorCost, resetCostTracker, startStep } from '../../../src/lib/cost';
import { summarizeError } from '../../../src/lib/object-generation';
import type { MagazineRunMode, MagazineRunStatus, RunConfig, WorkflowStep } from '../../../src/orchestrator/types';

export const MAGAZINE_STEP_ORDER: WorkflowStep[] = [
  'research',
  'rank',
  'edit',
  'prompt',
  'qa',
  'imagine',
  'pick',
  'publish',
];

export type MagazineRunRow = {
  run_id: string;
  mode: MagazineRunMode;
  status: MagazineRunStatus;
  current_step: WorkflowStep | null;
  seed_trend: string | null;
  budget_usd: number;
  total_cost_usd: number;
  started_at: string | null;
  completed_at: string | null;
  workflow_run_id?: string | null;
  error_code: string | null;
  error_message: string | null;
  updated_at: string | null;
};

export type RunStepResult = {
  runId: string;
  step: WorkflowStep | null;
  status: MagazineRunStatus;
  message?: string;
};

export async function createMagazineRun(input: {
  mode?: MagazineRunMode;
  seedTrend?: string;
  budgetUsd?: number;
} = {}): Promise<{ runId: string }> {
  const runId = randomUUID();
  const now = new Date().toISOString();
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.from('magazine_runs').insert({
    run_id: runId,
    mode: input.mode ?? 'manual',
    status: 'queued',
    current_step: 'research',
    seed_trend: input.seedTrend ?? null,
    budget_usd: input.budgetUsd ?? Number(process.env.MAGAZINE_BUDGET_USD ?? 4),
    total_cost_usd: 0,
    started_at: now,
    created_at: now,
    updated_at: now,
  });

  if (error) throw new Error(`Create run failed: ${error.message}`);
  return { runId };
}

export async function setWorkflowRunId(runId: string, workflowRunId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('magazine_runs')
    .update({ workflow_run_id: workflowRunId, updated_at: new Date().toISOString() })
    .eq('run_id', runId);

  if (error && !error.message.toLowerCase().includes('workflow_run_id')) {
    throw new Error(error.message);
  }
}

export async function loadMagazineRun(runId: string): Promise<MagazineRunRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('magazine_runs')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('magazine_runs') || message.includes('does not exist')) return null;
    throw new Error(error.message);
  }
  return (data as MagazineRunRow | null) ?? null;
}

export async function cancelMagazineRun(runId: string): Promise<void> {
  await updateRun(runId, {
    status: 'cancelled',
    completed_at: new Date().toISOString(),
    error_code: 'cancelled',
    error_message: 'Cancelled by admin.',
  });
}

export async function retryMagazineRun(runId: string): Promise<void> {
  const run = await loadMagazineRun(runId);
  if (!run) throw new Error(`Run ${runId} not found.`);
  if (!['blocked', 'failed'].includes(run.status) && !isStaleRunningRun(run)) return;

  await updateRun(runId, {
    status: 'queued',
    current_step: firstIncompleteStep(await loadRunArtifacts(runId)),
    error_code: null,
    error_message: null,
    completed_at: null,
  });
}

export async function runMagazineStep(runId: string, expectedStep?: WorkflowStep): Promise<RunStepResult> {
  const run = await loadMagazineRun(runId);
  if (!run) throw new Error(`Run ${runId} not found.`);
  if (run.status === 'cancelled') return { runId, step: null, status: 'cancelled', message: 'Run cancelled.' };

  const artifacts = await loadRunArtifacts(runId);
  const step = (run.status === 'queued' && run.current_step) ? run.current_step : firstIncompleteStep(artifacts);
  if (!step) {
    await updateRun(runId, {
      status: 'complete',
      current_step: null,
      completed_at: new Date().toISOString(),
      total_cost_usd: artifacts.totalCost,
    });
    return { runId, step: null, status: 'complete' };
  }

  if (expectedStep && step !== expectedStep) {
    return { runId, step, status: 'running', message: `Skipped ${expectedStep}; next incomplete step is ${step}.` };
  }

  const runningStep = artifacts.steps.find((candidate) => candidate.step === step && candidate.status === 'running');
  if (runningStep && !isStaleStep(runningStep.created_at)) {
    return { runId, step, status: 'running', message: `${step} is already running.` };
  }

  await updateRun(runId, {
    status: 'running',
    current_step: step,
    error_code: null,
    error_message: null,
  });

  const createdAt = new Date().toISOString();
  resetCostTracker();
  await loadPriorCost(runId);
  startStep(step);

  await persistStep({
    runId,
    step,
    status: 'running',
    input: null,
    output: null,
    sources: [],
    createdAt,
  });

  try {
    const output = await executeStep(step, run);
    const stepCost = endStep();
    const totalCost = getTotalCost();
    const sourceStats = sourceMetadata(output);

    await persistStep({
      runId,
      step,
      status: 'complete',
      input: null,
      output,
      sources: sourceStats.sources,
      estimatedCostUsd: stepCost,
      sourceCount: sourceStats.sourceCount,
      publisherCount: sourceStats.publisherCount,
      createdAt,
      completedAt: new Date().toISOString(),
    });

    const nextArtifacts = await loadRunArtifacts(runId);
    const nextStep = firstIncompleteStep(nextArtifacts);

    if (step === 'qa') {
      const verdict = String((output as { verdict?: string }).verdict ?? '');
      if (verdict !== 'approve') {
        await updateRun(runId, {
          status: 'blocked',
          current_step: 'qa',
          total_cost_usd: totalCost,
          error_code: `qa_${verdict || 'missing'}`,
          error_message: `QA verdict is ${verdict || 'missing'}; fix revision requirements before image generation.`,
        });
        return { runId, step, status: 'blocked', message: `QA verdict is ${verdict}.` };
      }
    }

    await updateRun(runId, {
      status: nextStep ? 'running' : 'complete',
      current_step: nextStep,
      total_cost_usd: totalCost,
      completed_at: nextStep ? null : new Date().toISOString(),
    });

    return { runId, step, status: nextStep ? 'running' : 'complete' };
  } catch (error) {
    const summary = summarizeError(error);
    const stepCost = getStepCost(step);
    const totalCost = getTotalCost();
    const blocked = summary.toLowerCase().includes('blocked_') || summary.toLowerCase().includes('cannot publish');
    const status: MagazineRunStatus = blocked ? 'blocked' : 'failed';

    await persistStep({
      runId,
      step,
      status,
      input: null,
      output: null,
      sources: [],
      estimatedCostUsd: stepCost,
      error: summary,
      recoverable: true,
      blockedReason: blocked ? summary : undefined,
      rawErrorSummary: summary,
      createdAt,
      completedAt: new Date().toISOString(),
    });

    await updateRun(runId, {
      status,
      current_step: step,
      total_cost_usd: totalCost,
      error_code: blocked ? 'blocked' : 'step_failed',
      error_message: summary,
    });

    return { runId, step, status, message: summary };
  }
}

async function executeStep(step: WorkflowStep, run: MagazineRunRow): Promise<unknown> {
  const config = runConfigFromRow(run);
  const artifacts = await loadRunArtifacts(run.run_id);

  switch (step) {
    case 'research':
      return runResearch({ runConfig: config, priorIssueSlugs: [] });
    case 'rank':
      return runRank({ runConfig: config, research: requiredOutput<ResearchOutput>(artifacts, 'research') });
    case 'edit':
      return runEdit({
        runConfig: config,
        ranked: requiredOutput<RankOutput>(artifacts, 'rank'),
        volume: await nextVolumeForDraft(),
      });
    case 'prompt':
      return runPrompt({
        draft: requiredOutput<EditOutput>(artifacts, 'edit'),
        ranked: requiredOutput<RankOutput>(artifacts, 'rank'),
      });
    case 'qa':
      return runQA({
        runConfig: config,
        draft: requiredOutput<EditOutput>(artifacts, 'edit'),
        prompts: requiredOutput<PromptOutput>(artifacts, 'prompt'),
        research: requiredOutput<ResearchOutput>(artifacts, 'research'),
        stepCostsSoFar: artifacts.totalCost,
      });
    case 'imagine':
      {
        const { runImagine } = await import('../../../src/executors/imagine');
        return runImagine({ runId: run.run_id, prompts: requiredOutput<PromptOutput>(artifacts, 'prompt') });
      }
    case 'pick':
      return autoPickVariants(run.run_id);
    case 'publish':
      return publishRunToApp(run.run_id);
    case 'approval':
      return { approved: true, autoApproved: true };
  }
}

function runConfigFromRow(run: MagazineRunRow): RunConfig {
  return {
    runId: run.run_id,
    ...(run.seed_trend ? { seedTrend: run.seed_trend } : {}),
    budgetUsd: Number(run.budget_usd || process.env.MAGAZINE_BUDGET_USD || 4),
    dateRange: currentWeekRange(),
    audienceTracks: ['man', 'woman', 'non-binary'],
  };
}

function firstIncompleteStep(artifacts: Awaited<ReturnType<typeof loadRunArtifacts>>): WorkflowStep | null {
  const complete = (step: WorkflowStep) =>
    artifacts.steps
      .filter((row) => row.step === step && row.status === 'complete')
      .sort((a, b) => String(b.completed_at ?? b.created_at).localeCompare(String(a.completed_at ?? a.created_at)))[0];

  const staleOrMissing = (step: WorkflowStep, dependency?: { completed_at: string | null; created_at: string }) => {
    const row = complete(step);
    if (!row) return true;
    if (!dependency) return false;
    return String(row.completed_at ?? row.created_at).localeCompare(String(dependency.completed_at ?? dependency.created_at)) < 0;
  };

  const research = complete('research');
  if (!research) return 'research';
  const rank = complete('rank');
  if (staleOrMissing('rank', research)) return 'rank';
  const edit = complete('edit');
  if (staleOrMissing('edit', rank)) return 'edit';
  const prompt = complete('prompt');
  if (staleOrMissing('prompt', edit)) return 'prompt';
  const qa = complete('qa');
  if (staleOrMissing('qa', prompt)) return 'qa';

  const verdict = String((qa?.output as { verdict?: string } | null)?.verdict ?? '');
  if (verdict !== 'approve') return 'edit';

  if (staleOrMissing('imagine', qa)) return 'imagine';
  const imagine = complete('imagine');
  if (staleOrMissing('pick', imagine)) return 'pick';
  const pick = complete('pick');
  if (staleOrMissing('publish', pick)) return 'publish';
  return null;
}

function requiredOutput<T>(artifacts: Awaited<ReturnType<typeof loadRunArtifacts>>, step: WorkflowStep): T {
  const row = artifacts.steps.find((candidate) => candidate.step === step && candidate.status === 'complete');
  if (!row) throw new Error(`Missing completed ${step} step.`);
  return row.output as T;
}

async function autoPickVariants(runId: string): Promise<{ pickedSlots: string[] }> {
  const artifacts = await loadRunArtifacts(runId);
  const supabaseAdmin = getSupabaseAdmin();
  const pickedSlots: string[] = [];

  for (const slot of REQUIRED_SLOTS) {
    const existingPick = artifacts.variants.find((variant) => variant.slot === slot && variant.picked);
    if (existingPick) {
      pickedSlots.push(slot);
      continue;
    }

    const candidate = artifacts.variants.find((variant) => variant.slot === slot);
    if (!candidate) throw new Error(`blocked_missing_asset: no generated variants for ${slot}.`);

    const { error } = await supabaseAdmin
      .from('magazine_image_variants')
      .update({ picked: true, picked_at: new Date().toISOString() })
      .eq('id', candidate.id);

    if (error) throw new Error(error.message);
    pickedSlots.push(slot);
  }

  return { pickedSlots };
}

async function nextVolumeForDraft(): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from('magazine_issue_manifests')
    .select('volume')
    .order('volume', { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  const volume = data?.[0]?.volume;
  return typeof volume === 'number' ? volume + 1 : 19;
}

async function updateRun(runId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('magazine_runs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('run_id', runId);

  if (error) throw new Error(error.message);
}

function sourceMetadata(output: unknown) {
  const sources = Array.isArray((output as { sources?: unknown }).sources)
    ? ((output as { sources: unknown[] }).sources as any[])
    : [];
  const publishers = new Set(
    sources.map((source) => String(source.publisher ?? '').trim().toLowerCase()).filter(Boolean),
  );
  return {
    sources,
    sourceCount: sources.length,
    publisherCount: publishers.size,
  };
}

function currentWeekRange(): string {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (date: Date) => date.toISOString().slice(0, 10);
  return `${fmt(start)} to ${fmt(end)}`;
}

function isStaleRunningRun(run: MagazineRunRow): boolean {
  return run.status === 'running' && isStaleStep(run.updated_at ?? run.started_at ?? new Date(0).toISOString());
}

function isStaleStep(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > 6 * 60_000;
}
