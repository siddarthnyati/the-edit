// Single source of truth for run cost. Executors push their per-call cost
// here; the orchestrator reads the running total to enforce the budget and
// to persist a real `estimated_cost_usd` value with each step.
//
// Three caps:
//   HARD_CAP_USD       — kills the run via thrown error
//   BUDGET_USD         — soft warning, run continues
//   WEB_SEARCH_CAP_USD — flags exceededWebSearchCap(); search executor
//                        stops issuing more queries but salvages whatever
//                        sources it already gathered (no point throwing
//                        away dollars already spent)

let totalUsd = 0;
let webSearchUsd = 0;
let imagineUsd = 0;
let perStepUsd: Record<string, number> = {};
let currentStep: string | null = null;

const HARD_CAP_USD = parseFloat(process.env['MAGAZINE_HARD_CAP_USD'] ?? '4');
const BUDGET_USD = parseFloat(process.env['MAGAZINE_BUDGET_USD'] ?? '1.5');
const WEB_SEARCH_CAP_USD = parseFloat(process.env['MAGAZINE_WEB_SEARCH_CAP_USD'] ?? '1');
const IMAGINE_CAP_USD = parseFloat(process.env['MAGAZINE_IMAGINE_CAP_USD'] ?? '3');

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

// Web search bills separately from token cost (Anthropic charges $10/1000
// queries plus the search results land in input tokens). Track it on its
// own axis so the search executor can salvage what it has when the cap is
// exceeded instead of throwing.
export function recordWebSearchCost(usd: number) {
  webSearchUsd += usd;
  recordCost(usd, 'web-search'); // also counts toward the total cap
}

export function exceededWebSearchCap(): boolean {
  return webSearchUsd > WEB_SEARCH_CAP_USD;
}

export function getWebSearchCost(): number {
  return webSearchUsd;
}

// Gemini image generation has its own per-run cap. The imagine executor
// checks this between slots and aborts if exceeded — partial results stay
// in the variants table for whatever slots have already been generated.
export function recordImagineCost(usd: number) {
  imagineUsd += usd;
  totalUsd += usd;
  if (currentStep) perStepUsd[currentStep] = (perStepUsd[currentStep] ?? 0) + usd;

  if (totalUsd > HARD_CAP_USD) {
    throw new Error(
      `HARD COST CAP EXCEEDED: $${totalUsd.toFixed(4)} > $${HARD_CAP_USD.toFixed(2)}. ` +
      `Aborting run.`,
    );
  }
}

export function exceededImagineCap(): boolean {
  return imagineUsd > IMAGINE_CAP_USD;
}

export function getImagineCost(): number {
  return imagineUsd;
}

export function getImagineCap(): number {
  return IMAGINE_CAP_USD;
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
  webSearchUsd = 0;
  imagineUsd = 0;
  perStepUsd = {};
  currentStep = null;
}

// Seed the in-memory cost tracker with prior costs persisted to Supabase
// for a given runId. Call this at the top of every script that touches
// the cost system (imagine, publish) so the hard cap accounts for what
// the draft script already spent.
//
// Imports supabase lazily to avoid pulling DB code into pure-logic flows.
export async function loadPriorCost(runId: string): Promise<number> {
  const { supabase } = await import('./supabase.js');
  const { data, error } = await supabase
    .from('magazine_run_steps')
    .select('estimated_cost_usd')
    .eq('run_id', runId);

  if (error) {
    console.warn(`[cost] could not load prior costs for ${runId}: ${error.message}`);
    return 0;
  }

  const prior = (data ?? []).reduce(
    (sum: number, row: { estimated_cost_usd: number | null }) => sum + (row.estimated_cost_usd ?? 0),
    0,
  );
  totalUsd = prior;
  console.log(`[cost] seeded total from prior steps: $${prior.toFixed(4)} (hard cap $${HARD_CAP_USD.toFixed(2)})`);
  return prior;
}
