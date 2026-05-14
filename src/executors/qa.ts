import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { BRAND_PREAMBLE, designMd } from '../lib/context.js';
import { recordCost } from '../lib/cost.js';
import { generateObjectWithRepair } from '../lib/object-generation.js';
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

  // Cached prefix: BRAND_PREAMBLE + full DESIGN.md (~21K tokens). Stable
  // across every QA call; cacheControl makes the second-run-onward read
  // it at 0.1× input cost instead of full price.
  const cachedContext = [
    BRAND_PREAMBLE,
    '',
    '## DESIGN.md (full — apply all bans strictly)',
    designMd(),
  ].join('\n');

  const variableInput = [
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
    '## Approval gate policy',
    'Use QA as a production safety gate, not as an infinite copy-polish loop.',
    'APPROVE when the issue has no hard ship blockers, even if you see optional editorial improvements.',
    'Only use REVISE for hard blockers:',
    '- incomplete/truncated copy, broken JSON/content shape, missing required sections, or contradictory production instructions',
    '- exact DESIGN.md hard bans in user-facing copy or generation prompts',
    '- unsupported factual claims presented as reported facts, especially named designers/houses/counts/dates/market adoption',
    '- missing required images, missing alt text, or alt text that gives false visual information',
    '- prompts that can create banned visuals such as visible AI-generated human faces, flat-lays, branded logos, or illegible assets',
    'Do NOT block on subjective wording preferences, new headline alternatives, marginal Vogue-test taste calls, or optional polish.',
    'If copy is clearly framed as editorial perspective rather than sourced fact, do not treat it as an unsupported factual claim.',
    'If a concern is non-blocking, mention it in summary only and keep verdict approve.',
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
  ].join('\n');

  const { object, usage, providerMetadata } = await generateObjectWithRepair({
    repairLabel: 'qa',
    model: anthropic(model),
    schema: QAReportSchema,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: cachedContext,
            providerOptions: {
              // 1-hour TTL costs 2× write but pays back after 3+ reads.
              // QA reads the same DESIGN.md on every run — well worth it.
              anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } },
            },
          },
          { type: 'text', text: variableInput },
        ],
      },
    ],
  });

  const cacheMeta = providerMetadata?.['anthropic'] as { cacheReadInputTokens?: number; cacheCreationInputTokens?: number } | undefined;
  const cacheRead = cacheMeta?.cacheReadInputTokens ?? 0;
  const cacheWrite = cacheMeta?.cacheCreationInputTokens ?? 0;
  const uncachedInput = Math.max(0, usage.promptTokens - cacheRead - cacheWrite);

  // Anthropic billing: cache write = 1.25× input rate, cache read = 0.1× input rate.
  const estimatedCostUsd =
    (uncachedInput * 0.000003) +
    (cacheWrite * 0.000003 * 1.25) +
    (cacheRead * 0.000003 * 0.1) +
    (usage.completionTokens * 0.000015);

  recordCost(estimatedCostUsd, 'qa');
  console.log(
    `[qa] ~$${estimatedCostUsd.toFixed(4)} | ${usage.promptTokens}p (uncached:${uncachedInput} | ` +
    `cache-read:${cacheRead} | cache-write:${cacheWrite}) + ${usage.completionTokens}c tokens`,
  );

  return object;
}
