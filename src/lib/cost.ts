// Single source of truth for run cost. Executors push their per-call cost
// here; the orchestrator reads the running total to enforce the budget and
// to persist a real `estimated_cost_usd` value with each step.

let totalUsd = 0;
let perStepUsd: Record<string, number> = {};
let currentStep: string | null = null;

const HARD_CAP_USD = parseFloat(process.env['MAGAZINE_HARD_CAP_USD'] ?? '25');
const BUDGET_USD = parseFloat(process.env['MAGAZINE_BUDGET_USD'] ?? '4');

export function startStep(label: string) {
  currentStep = label;
  perStepUsd[label] = 0;
}

export function recordCost(usd: number, sublabel?: string) {
  totalUsd += usd;
  if (currentStep) perStepUsd[currentStep] = (perStepUsd[currentStep] ?? 0) + usd;

  if (totalUsd > HARD_CAP_USD) {
    throw new Error(
      `HARD COST CAP EXCEEDED: $${totalUsd.toFixed(4)} > $${HARD_CAP_USD.toFixed(2)} ` +
      `(last addition: ${sublabel ?? 'unlabeled'} +$${usd.toFixed(4)}). ` +
      `Aborting run. Increase MAGAZINE_HARD_CAP_USD if intentional.`,
    );
  }

  if (totalUsd > BUDGET_USD) {
    console.warn(
      `[cost] over soft budget: $${totalUsd.toFixed(4)} > $${BUDGET_USD.toFixed(2)} ` +
      `(continuing toward hard cap $${HARD_CAP_USD.toFixed(2)})`,
    );
  }
}

export function getStepCost(label: string): number {
  return perStepUsd[label] ?? 0;
}

export function getTotalCost(): number {
  return totalUsd;
}

export function endStep(): number {
  if (!currentStep) return 0;
  const cost = perStepUsd[currentStep] ?? 0;
  currentStep = null;
  return cost;
}

export function resetCostTracker() {
  totalUsd = 0;
  perStepUsd = {};
  currentStep = null;
}
