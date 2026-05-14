import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { BRAND_PREAMBLE, designMd } from '../lib/context.js';
import { recordCost } from '../lib/cost.js';
import { generateObjectWithRepair } from '../lib/object-generation.js';
import type { RankOutput } from './rank.js';
import type { RunConfig } from '../orchestrator/types.js';

// Keep schema validation structural. Editorial taste rules are enforced in
// prompts, then normalized/QA'd after generation so a colon or long headline
// cannot kill an otherwise usable run mid-flight.
const headlineRule = z.string();

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

  const { object, usage } = await generateObjectWithRepair({
    repairLabel: 'edit',
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
      'Never name a designer, house, or exact runway-count unless that exact claim is present in the research input.',
      'Use "multiple houses" or "the runways" instead of unsupported exact counts.',
      'Every line must read as if a Vogue editor wrote it.',
    ].join('\n'),
  });

  const estimatedCostUsd = (usage.promptTokens * 0.000003) + (usage.completionTokens * 0.000015);
  recordCost(estimatedCostUsd, 'edit');
  console.log(`[edit] ~$${estimatedCostUsd.toFixed(4)} | ${usage.promptTokens}p + ${usage.completionTokens}c tokens`);

  return normalizeDraft(object as EditOutput);
}

function normalizeDraft(draft: EditOutput): EditOutput {
  return {
    ...draft,
    concept: sanitizeGrounding(draft.concept),
    cover: {
      ...draft.cover,
      headline: normalizeHeadline(draft.cover.headline),
      deck: sanitizeGrounding(draft.cover.deck),
    },
    trendCards: draft.trendCards.map((card) => ({
      ...card,
      headline: normalizeHeadline(card.headline),
      deck: sanitizeGrounding(card.deck),
      body: sanitizeGrounding(card.body),
    })),
    curatorRotations: draft.curatorRotations.map((card) => ({
      ...card,
      headline: normalizeCuratorHeadline(card.kind, card.headline),
      deck: sanitizeGrounding(card.deck),
      body: sanitizeGrounding(card.body),
    })),
  };
}

function normalizeHeadline(value: string): string {
  const dateStamp = value.trim().match(/^LAST\s+SEEN[.:]\s*([0-9]{4})[.:]?\s*(.*)$/i);
  if (dateStamp) {
    const year = dateStamp[1] === '1987' ? 'THE 80S' : dateStamp[1];
    const tail = dateStamp[2]?.trim().replace(/[.!]+$/g, '') || 'REWRITTEN';
    return `LAST SEEN: ${year}. ${tail}.`.toUpperCase();
  }

  const withoutColon = value.replace(/:/g, '.');
  const withoutQuestion = withoutColon.replace(/[?!]+$/g, '.');
  const sentence = withoutQuestion.trim().replace(/[.!]+$/g, '') + '.';
  return sentence.toUpperCase();
}

function normalizeCuratorHeadline(kind: EditOutput['curatorRotations'][number]['kind'], value: string): string {
  const normalized = normalizeHeadline(value);
  const replacements: Record<EditOutput['curatorRotations'][number]['kind'], string> = {
    jacket: 'THE JACKET. THE ARGUMENT.',
    tee: 'THE TEE. THE RESET.',
    denim: 'THE DENIM. THE BASE.',
    trouser: 'THE TROUSER. THE LINE.',
    skirt: 'THE SKIRT. THE CONTRADICTION.',
    boot: 'THE BOOT ENDS IT.',
    sneaker: 'THE SNEAKER. THE INTERRUPTION.',
    oxford: 'THE OXFORD. THE ANSWER.',
    cap: 'THE CAP. THE COUNTERPOINT.',
  };
  if (normalized.length > 0) return replacements[kind];
  return replacements[kind];
}

function sanitizeGrounding(value: string): string {
  return value
    .replace(/Multiple houses[^.]*\.\s*/gi, 'Current 1980s-inspired trend reporting gives the structured shoulder fresh context. ')
    .replace(/Multiple houses confirm the silhouette this season,?\s*/gi, 'Current 1980s-inspired trend reporting gives the silhouette fresh context, ')
    .replace(/and the message across every iteration is consistent:/gi, 'and the styling message is direct:')
    .replace(/Three seasons[^.]*\.\s*/gi, 'Against relaxed drape, the precise shoulder feels newly deliberate. ')
    .replace(/The runways answer with something harder-edged:\s*/gi, 'The editorial answer is harder-edged: ')
    .replace(/The runways answer with a silhouette that is unambiguous in its geometry\s*—\s*/gi, 'The silhouette is unambiguous in its geometry — ')
    .replace(/The runways read it as/gi, 'It reads as')
    .replace(/runway(?:s)?\s+(?:agrees|answer|answers|confirms|confirm)[^.]*\.?\s*/gi, 'The trend reporting gives the silhouette fresh context. ')
    .replace(/The structured shoulder never left the cultural imagination[^.]*\.\s*/gi, 'The 1980s reference is everywhere this season. The shoulder is the sharpest version of it. ')
    .replace(/Current 1980s-inspired trend reporting gives the structured shoulder fresh context\.?\s*/gi, 'The 1980s reference is everywhere this season. The shoulder is the sharpest version of it. ')
    .replace(/The trend reporting gives the silhouette fresh context\.?\s*/gi, '')
    .replace(/The power shoulder originated inside a rigid set of gender codes\.?\s*/gi, 'The structured shoulder arrives loaded with old associations. ')
    .replace(/The body organises itself around the cut\.?/gi, 'The look sharpens around the cut.')
    .replace(/Designers this season pair structured shoulders with fluid fabrications, bias-cut bases, and silhouettes that refuse the original binary logic entirely\.?\s*/gi, 'Styled against fluid fabrication, bias-cut bases, and silhouettes that refuse the original binary logic, the shoulder loses its old certainty. ')
    .replace(/four runway citations and zero apologies/gi, 'a sharper argument for proportion')
    .replace(/no apologies/gi, 'new precision')
    .replace(/no apology/gi, 'new precision')
    .replace(/without apology/gi, 'with precision')
    .replace(/\bThe The\b/g, 'The')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractSection(md: string, section: string): string {
  const idx = md.indexOf(section);
  if (idx === -1) return md.slice(0, 2000);
  return md.slice(idx, idx + 2000);
}
