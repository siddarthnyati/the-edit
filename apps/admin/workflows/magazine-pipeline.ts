import { runMagazineStep, type RunStepResult } from '@/lib/runs';
import type { WorkflowStep } from '../../../src/orchestrator/types';

export type MagazinePipelineInput = {
  runId: string;
};

const STEPS: WorkflowStep[] = [
  'research',
  'rank',
  'edit',
  'prompt',
  'qa',
  'imagine',
  'pick',
  'publish',
];

export async function magazinePipelineWorkflow(input: MagazinePipelineInput): Promise<RunStepResult> {
  'use workflow';

  let latest: RunStepResult = { runId: input.runId, step: null, status: 'queued' };
  for (const step of STEPS) {
    latest = await executePipelineStep(input.runId, step);
    if (latest.status === 'blocked' || latest.status === 'failed' || latest.status === 'cancelled') {
      return latest;
    }
  }

  return latest;
}

async function executePipelineStep(runId: string, step: WorkflowStep): Promise<RunStepResult> {
  'use step';
  console.log(`[magazine-workflow] START ${runId} ${step}`);
  const result = await runMagazineStep(runId, step);
  console.log(`[magazine-workflow] DONE ${runId} ${step} -> ${result.status}`);
  return result;
}
