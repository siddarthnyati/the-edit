import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { BRAND_PREAMBLE, designMd } from '../lib/context.js';
import { recordCost } from '../lib/cost.js';
import type { RankOutput } from './rank.js';
import type { RunConfig } from '../orchestrator/types.js';

// Headline rules from DESIGN.md §5.5 — enforced as Zod refines so the
// editor can't ship a textbook-style headline that fails the Vogue test.
const headlineRule = z.string()
  .refine((s) => s.split(/\s+/).filter(Boolean).length <= 6, '≤ 6 words')
  .refine((s) => /[.!?]?$/.test(s) && !/[?!]$/.test(s), 'must end in . (no ? or !)')
  .refine((s) => !s.includes(':'), 'no colon — colons read as textbook entries')
  .refine((s) => !/^(how |why |what |where |when |is |are |does |do )/i.test(s), 'no question opener');

const IssueDraftSchema = z.object({
  concept: z.string().describe('One paragraph editorial concept for the issue'),
  cover: z.object({
    eyebrow: z.string().describe('Volume and context line, e.g. "VOL. 19 · THIS WEEK\'S RETURN"'),
    headline: headlineRule.describe('Monumental UPPERCASE headline, ≤6 words, ends in period. See DESIGN.md §5.5 for the four headline patterns.'),
    deck: z.string().describe('Italic subtitle in Magazine voice, max 12 words'),
    slug: z.string().describe('URL-safe slug, e.g. "vol-19-wide-wale"'),
  }),
  trendCards: z.array(z.object({
    slug: z.string(),
    eyebrow: z.string(),
    headline: headlineRule,
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
      '',
      '## DESIGN.md §5.5 — headline patterns (apply strictly)',
      'Every headline (cover + every trend card) MUST follow one of these four shapes:',
      '',
      '1. THE REVERSAL — flip the era from "old" to "now"',
      '   "1990s V-neck jumper" → "YOUR DAD\'S SWEATER. YOUR MOVE."',
      '',
      '2. THE POSSESSIVE — endowment effect via "your"',
      '   "Bootcut jeans return" → "WHAT YOUR MOTHER WORE. WORN BETTER."',
      '',
      '3. THE DATE STAMP — curiosity gap via "last seen"',
      '   "Bohemian layering returns" → "LAST SEEN: 2004. REWRITTEN."',
      '',
      '4. THE SINGLE VERB — cognitive ease via verb-only',
      '   "V-neck heritage knitwear" → "RETURNING."',
      '',
      'Construction rules:',
      '- ≤ 6 words. If you need more, you don\'t have a headline yet.',
      '- Ends in period (.). Never ?, !, or ,. Never a colon (:).',
      '- One specific noun per headline. "The slip dress" beats "minimalist eveningwear".',
      '- Year reference allowed once per issue maximum.',
      '- Never name a designer or brand in the headline (saves them for the body).',
      '- Never explain the trend in the headline. The deck does that.',
      '',
      'BAD vs GOOD examples:',
      '- BAD: "The Bootcut Jean: Y2K Denim Rewired for 2026"',
      '  GOOD: "WHAT YOUR MOTHER WORE. CUT BETTER."',
      '- BAD: "Bohemian Layering: The Chloé Decade Returns"',
      '  GOOD: "SIENNA\'S CLOSET. STILL OPEN."',
      '- BAD: "Six Houses Confirmed This Across SS26"',
      '  GOOD: "SIX HOUSES. ONE SILHOUETTE."',
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
      'Cover headline: pick from the four headline patterns above. ≤6 words, ends in period, no colon.',
      'Each trend card headline: also pick from the four patterns. Each card uses a DIFFERENT pattern to vary register.',
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
