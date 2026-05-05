import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { BRAND_PREAMBLE, designMd } from '../lib/context.js';
import { recordCost } from '../lib/cost.js';
import type { RankOutput } from './rank.js';
import type { RunConfig } from '../orchestrator/types.js';

const IssueDraftSchema = z.object({
  concept: z.string().describe('One paragraph editorial concept for the issue'),
  cover: z.object({
    eyebrow: z.string().describe('Volume and context line, e.g. "VOL. 19 · THIS WEEK\'S RETURN"'),
    headline: z.string().describe('Monumental uppercase headline, max 6 words'),
    deck: z.string().describe('Italic subtitle in Magazine voice, max 12 words'),
    slug: z.string().describe('URL-safe slug, e.g. "vol-19-wide-wale"'),
  }),
  trendCards: z.array(z.object({
    slug: z.string(),
    eyebrow: z.string(),
    headline: z.string(),
    deck: z.string(),
    body: z.string().describe('2-3 sentences. Editorial. No bullet points.'),
    kind: z.enum(['jacket', 'tee', 'denim', 'trouser', 'skirt', 'boot', 'sneaker', 'oxford', 'cap']),
    section: z.literal('trend'),
  })).length(3),
  curatorRotations: z.array(z.object({
    slug: z.string(),
    eyebrow: z.string(),
    headline: z.string(),
    deck: z.string(),
    body: z.string(),
    kind: z.enum(['jacket', 'tee', 'denim', 'trouser', 'skirt', 'boot', 'sneaker', 'oxford', 'cap']),
    section: z.literal('curator'),
    baseSelectionIds: z.array(z.string()).describe('Starter pack item IDs this card pairs with'),
  })).min(1).max(3),
  vogueSelfCheck: z.string().describe('One sentence confirming all copy passes the Vogue test'),
});

export type EditInput = {
  runConfig: RunConfig;
  ranked: RankOutput;
  volume: number;
};

export type EditOutput = z.infer<typeof IssueDraftSchema>;

export async function runEdit(input: EditInput): Promise<EditOutput> {
  const model = process.env['MAGAZINE_EDITOR_MODEL'] ?? 'claude-sonnet-4-6';

  const { object, usage } = await generateObject({
    model: anthropic(model),
    schema: IssueDraftSchema,
    system: [
      BRAND_PREAMBLE,
      '',
      '## DESIGN.md §4 — banned language and visuals',
      extractSection(designMd(), '§4'),
    ].join('\n'),
    prompt: [
      `Volume: ${input.volume}`,
      `Trend: ${input.ranked.winningTrend}`,
      `Era reference: ${input.ranked.eraReference}`,
      `Rationale: ${input.ranked.rationale}`,
      '',
      '## Trend stories',
      JSON.stringify(input.ranked.trendStories, null, 2),
      '',
      'Write the full Magazine issue draft.',
      'Cover headline: monumental, uppercase, 3-6 words.',
      'All body copy: declarative, present tense, no passive voice.',
      'Every line must read as if a Vogue editor wrote it.',
    ].join('\n'),
  });

  const estimatedCostUsd = (usage.promptTokens * 0.000003) + (usage.completionTokens * 0.000015);
  recordCost(estimatedCostUsd, 'edit');
  console.log(`[edit] ~$${estimatedCostUsd.toFixed(4)} | ${usage.promptTokens}p + ${usage.completionTokens}c tokens`);

  return object;
}

function extractSection(md: string, section: string): string {
  const idx = md.indexOf(section);
  if (idx === -1) return md.slice(0, 2000);
  return md.slice(idx, idx + 2000);
}
