import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { BRAND_PREAMBLE, designMd } from '../lib/context.js';
import type { EditOutput } from './edit.js';
import type { PromptOutput } from './prompt.js';
import type { ResearchOutput } from './research.js';
import type { RunConfig } from '../orchestrator/types.js';

const QAReportSchema = z.object({
  verdict: z.enum(['approve', 'revise', 'reject']),
  voguePassed: z.boolean(),
  bannedLanguageFound: z.array(z.string()).describe('Exact strings that violate DESIGN.md §4'),
  unsupportedClaims: z.array(z.string()).describe('Factual claims not grounded in research sources'),
  assetPromptIssues: z.array(z.string()).describe('Prompt violations against asset rules'),
  accessibilityGaps: z.array(z.string()).describe('Missing or weak alt text'),
  estimatedTotalCostUsd: z.number(),
  withinBudget: z.boolean(),
  revisionRequirements: z.array(z.object({
    section: z.string(),
    issue: z.string(),
    requirement: z.string(),
  })).describe('Required only when verdict is revise or reject'),
  summary: z.string().describe('One paragraph QA summary for the approval handoff'),
});

export type QAInput = {
  runConfig: RunConfig;
  draft: EditOutput;
  prompts: PromptOutput;
  research: ResearchOutput;
  stepCostsSoFar: number;
};

export type QAOutput = z.infer<typeof QAReportSchema>;

export async function runQA(input: QAInput): Promise<QAOutput> {
  const model = process.env['MAGAZINE_QA_MODEL'] ?? 'claude-sonnet-4-6';

  const { object, usage } = await generateObject({
    model: anthropic(model),
    schema: QAReportSchema,
    system: [
      BRAND_PREAMBLE,
      '',
      '## DESIGN.md (full — apply all bans strictly)',
      designMd(),
    ].join('\n'),
    prompt: [
      `Budget ceiling: $${input.runConfig.budgetUsd}`,
      `Cost so far: $${input.stepCostsSoFar.toFixed(4)}`,
      '',
      '## Issue draft to review',
      JSON.stringify(input.draft, null, 2),
      '',
      '## Asset prompts to review',
      JSON.stringify(input.prompts, null, 2),
      '',
      '## Research sources (for grounding check)',
      JSON.stringify(input.research.sources, null, 2),
      '',
      'Perform a full QA pass:',
      '1. Vogue test — would a Vogue editor have written every line?',
      '2. Banned language — any string from DESIGN.md §4?',
      '3. Unsupported claims — anything not grounded in the research sources?',
      '4. Asset prompt compliance — any banned imagery type?',
      '5. Accessibility — alt text present and editorial for every asset?',
      '6. Budget — total cost within ceiling?',
      '',
      'Verdict must be approve, revise, or reject.',
      'Revise requires exact section + replacement requirement for every issue found.',
    ].join('\n'),
  });

  const estimatedCostUsd = (usage.promptTokens * 0.000003) + (usage.completionTokens * 0.000015);
  console.log(`[qa] ~$${estimatedCostUsd.toFixed(4)} | ${usage.promptTokens}p + ${usage.completionTokens}c tokens`);

  return object;
}
