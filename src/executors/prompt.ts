import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { BRAND_PREAMBLE } from '../lib/context.js';
import { recordCost } from '../lib/cost.js';
import { generateObjectWithRepair } from '../lib/object-generation.js';
import type { EditOutput } from './edit.js';
import type { RankOutput } from './rank.js';

// Banned tokens lifted from DESIGN.md §4, §6, §8. Any of these in a prompt
// or alt text triggers a Zod validation error and the executor will retry
// with corrective system instructions. Cheaper than letting QA catch them.
const BANNED_PROMPT_TOKENS = [
  // §8 composition bans
  'flat-lay', 'flat lay', 'flatlay', 'from above', 'top-down', 'topdown',
  'overhead view', 'laid flat', 'birds-eye', "bird's-eye", 'birdseye',
  // §6 background tinting / §4 gradient bans
  'gradient', 'tinted', 'blue-tint', 'blue-tinted', 'colour cast', 'color cast',
  'textured background', 'pattern background', 'noise texture',
  // Asset tool name bans (no "powered by AI" leak)
  'nano banana', 'kling', 'imagen', 'gemini', 'midjourney', 'dall-e', 'stable diffusion',
  // Brand logo / name bans (non-exhaustive — top offenders)
  'calvin klein', 'nike', 'adidas', 'gucci', 'louis vuitton', 'chanel',
  // Anatomical close-up bans
  'crotch', 'groin close-up', 'cleavage close-up',
];

function checkPromptText(label: string, text: string): string | null {
  let lower = text.toLowerCase();
  for (const token of BANNED_PROMPT_TOKENS) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    lower = lower
      .replace(new RegExp(`\\b(no|never include|avoid|without)\\s+${escaped}\\b`, 'g'), '')
      .replace(new RegExp(`\\b${escaped}\\s+(is|are)\\s+(banned|forbidden|not allowed)\\b`, 'g'), '');
    if (lower.includes(token)) {
      return `${label} contains banned token "${token}"`;
    }
  }
  return null;
}

// Alt text must lead with a physical garment descriptor per DESIGN.md §13.
// Heuristic: look for at least one of (color | fabric | cut) word in the
// first 80 characters before the editorial flourish.
const PHYSICAL_DESCRIPTORS = [
  'denim', 'cotton', 'wool', 'silk', 'linen', 'leather', 'cashmere',
  'jersey', 'velvet', 'corduroy', 'knit', 'satin', 'chiffon', 'tweed',
  'black', 'white', 'navy', 'indigo', 'cream', 'charcoal', 'camel',
  'oat', 'ivory', 'rust', 'olive', 'crimson', 'beige', 'tan', 'grey', 'gray',
];

function checkAltText(label: string, text: string): string | null {
  const opening = text.toLowerCase().slice(0, 100);
  const hasDescriptor = PHYSICAL_DESCRIPTORS.some((d) => opening.includes(d));
  if (!hasDescriptor) {
    return `${label} alt text missing physical descriptor (color/fabric/cut) in first 100 chars`;
  }
  return null;
}

function validatePromptSuite(suite: { coverStart: { prompt: string; altText: string }; coverEnd: { prompt: string; altText: string }; coverMotion: { prompt: string; altText: string }; trendCardPrompts: { slug: string; prompt: string; altText: string }[]; curatorCardPrompts: { slug: string; prompt: string; altText: string }[] }): string[] {
  const issues: string[] = [];
  const slots: Array<{ label: string; prompt: string; altText: string }> = [
    { label: 'coverStart', prompt: suite.coverStart.prompt, altText: suite.coverStart.altText },
    { label: 'coverEnd', prompt: suite.coverEnd.prompt, altText: suite.coverEnd.altText },
    { label: 'coverMotion', prompt: suite.coverMotion.prompt, altText: suite.coverMotion.altText },
    ...suite.trendCardPrompts.map((c) => ({ label: `trend.${c.slug}`, prompt: c.prompt, altText: c.altText })),
    ...suite.curatorCardPrompts.map((c) => ({ label: `curator.${c.slug}`, prompt: c.prompt, altText: c.altText })),
  ];
  for (const s of slots) {
    const promptIssue = checkPromptText(`${s.label}.prompt`, s.prompt);
    if (promptIssue) issues.push(promptIssue);
    const altIssue = checkAltText(s.label, s.altText);
    if (altIssue) issues.push(altIssue);
  }
  return issues;
}

const AssetPromptSlotSchema = z.object({
  slug: z.string(),
  prompt: z.string(),
  altText: z.string(),
});

const AssetPromptSuiteSchema = z.object({
  coverStart: z.object({
    prompt: z.string().describe('Nano Banana prompt for the cover opening frame'),
    altText: z.string(),
  }),
  coverEnd: z.object({
    prompt: z.string().describe('Nano Banana prompt for the cover closing frame'),
    altText: z.string(),
  }),
  coverMotion: z.object({
    prompt: z.string().describe('Kling motion prompt for the single cover video'),
    durationSeconds: z.number().optional(),
    altText: z.string(),
  }),
  trendCardPrompts: z.array(AssetPromptSlotSchema).length(3),
  curatorCardPrompts: z.array(AssetPromptSlotSchema).min(1).max(3),
  promptNotes: z.string().describe('Any constraints or alternatives the human running these tools should know'),
});

const GeneratedAssetPromptSuiteSchema = z.object({
  coverStart: z.object({
    prompt: z.string(),
    altText: z.string(),
  }),
  coverEnd: z.object({
    prompt: z.string(),
    altText: z.string(),
  }),
  coverMotion: z.object({
    prompt: z.string(),
    durationSeconds: z.number().optional(),
    altText: z.string(),
  }),
  trendCardPrompts: z.array(AssetPromptSlotSchema).min(1).max(6),
  curatorCardPrompts: z.array(AssetPromptSlotSchema).min(0).max(6).default([]),
  promptNotes: z.string().optional(),
});

export type PromptInput = {
  draft: EditOutput;
  ranked: RankOutput;
};

export type PromptOutput = z.infer<typeof AssetPromptSuiteSchema>;

export async function runPrompt(input: PromptInput): Promise<PromptOutput> {
  const model = process.env['MAGAZINE_PROMPT_MODEL'] ?? 'claude-sonnet-4-6';

  const { object, usage } = await generateObjectWithRepair({
    repairLabel: 'prompt',
    model: anthropic(model),
    schema: GeneratedAssetPromptSuiteSchema,
    system: [
      BRAND_PREAMBLE,
      '',
      'Asset rules — apply strictly. QA will reject any prompt that violates them:',
      '',
      'COMPOSITION (default — garment-only editorial detail):',
      '- The base prompt should describe the GARMENT alone on a void or minimalist background.',
      '- No human, no model, no skin in the base prompt — the imagine executor adds per-variant',
      '  composition layered on top of yours.',
      '- The imagine executor will: generate 3 garment-only product shots at varying angles',
      '  (front / three-quarter / profile) and 1 Zara-style lifestyle shot with a diverse model.',
      '  Your job: describe the GARMENT richly. Camera/pose/model are appended automatically.',
      '',
      'BANNED compositions (DESIGN.md §8):',
      '- No flat-lays. No top-down views. No "from above" framing. No "laid flat" arrangements.',
      '- No styled prop arrangements. The garment must look like a finished editorial photograph.',
      '',
      'BANNED content:',
      '- No visible brand logos, brand names, or branded waistbands. Generic / unbranded garments only.',
      '- No anatomical close-ups (groin, chest, hip-only crops). Crop full body or above-knee.',
      '- No suggestive poses. Editorial standards.',
      '- No "powered by AI" attribution. Never name asset tools (Gemini, Nano Banana, Imagen, Kling) in prompts or alt text.',
      '- Do NOT specify model demographics, race, gender, or body type in your prompt — the imagine executor rotates these automatically per slot to ensure representation breadth across the issue.',
      '',
      'PROMPT STYLE:',
      '- Lead with the garment description: cut, fabric, color, era reference.',
      '- Then setting: studio lighting type, background tone.',
      '- End with editorial register cues: "magazine quality", "editorial sharp focus on textile".',
      '- Cover motion: defer for V2. The coverMotion field is a static placeholder only: describe no rotation, no motion, no camera move.',
      '',
      'BACKGROUNDS — strict rules:',
      '- Magazine assets MUST use: "True black void background, #000000, no gradient, no color cast."',
      '- Reserve "bone background, #FAFAFA, no texture, no color cast" for Sanctuary cutout product images only; this issue is Magazine, so default to true black.',
      '- NEVER use: warm off-white, gradient, color cast, blue-tint, textured background, pattern background.',
      '',
      'ALT TEXT — must lead with physical descriptors per DESIGN.md §13:',
      '- First 100 chars MUST contain at least one of: a fabric (denim/cotton/wool/silk/linen/leather/cashmere/jersey/velvet/corduroy/knit/satin) OR a color (black/white/navy/indigo/cream/charcoal/camel/oat/ivory).',
      '- Then editorial flourish in second clause. Example: "Dark indigo bootcut jeans, selvedge construction — the silhouette that closed the century and opens the season."',
    ].join('\n'),
    prompt: [
      `Trend: ${input.ranked.winningTrend} (from ${input.ranked.eraReference})`,
      '',
      '## Issue draft',
      `Cover: ${input.draft.cover.headline}`,
      `Concept: ${input.draft.concept}`,
      '',
      '## Trend cards',
      input.draft.trendCards.map((c) => `${c.slug}: ${c.headline} — ${c.body}`).join('\n'),
      '',
      '## Curator cards',
      input.draft.curatorRotations.map((c) => `${c.slug}: ${c.headline} — ${c.body}`).join('\n'),
      '',
      'Generate the full asset prompt suite for this issue.',
      'Create exactly one curatorCardPrompt for each curator card slug listed above. Do not invent or rename curator slugs.',
      'Each prompt MUST avoid flat-lay, top-down, brand logos, and anatomical close-ups.',
      'Vary the suggested camera angle across variants (front / three-quarter / profile / back).',
      'Write alt text in editorial voice — not captions.',
    ].join('\n'),
  });

  const estimatedCostUsd = (usage.promptTokens * 0.000003) + (usage.completionTokens * 0.000015);
  recordCost(estimatedCostUsd, 'prompt');
  console.log(`[prompt] ~$${estimatedCostUsd.toFixed(4)} | ${usage.promptTokens}p + ${usage.completionTokens}c tokens`);

  const suite = normalizePromptSuite(object, input.draft);

  // Validate against the ban list. If anything slipped through, log issues
  // and throw — orchestrator catches and the operator can either rerun or
  // adjust. Cheaper than letting QA catch it on the full DESIGN.md pass.
  const issues = validatePromptSuite(suite);
  if (issues.length > 0) {
    console.warn(`[prompt] post-generation validation found ${issues.length} issue(s):`);
    issues.forEach((i) => console.warn(`  - ${i}`));
    throw new Error(
      `Prompt suite failed pre-QA validation:\n  ${issues.join('\n  ')}\n\n` +
      `Re-run "npm run draft" — the system prompt warnings should prevent recurrence.`,
    );
  }

  return suite;
}

function normalizePromptSuite(
  suite: z.infer<typeof GeneratedAssetPromptSuiteSchema>,
  draft: EditOutput,
): PromptOutput {
  const trendCardPrompts = draft.trendCards.map((card) =>
    normalizeCardSlot(findSlot(suite.trendCardPrompts, card.slug) ?? fallbackSlot(card), card),
  );
  const curatorCardPrompts = draft.curatorRotations.map((card) =>
    normalizeCardSlot(findSlot(suite.curatorCardPrompts, card.slug) ?? fallbackSlot(card), card),
  );

  return {
    coverStart: normalizeCoverSlot(suite.coverStart),
    coverEnd: normalizeCoverSlot(suite.coverEnd),
    coverMotion: {
      ...suite.coverMotion,
      prompt: normalizePromptBackground(stripMotionContradictions(suite.coverMotion.prompt)),
    },
    trendCardPrompts,
    curatorCardPrompts,
    promptNotes: suite.promptNotes ?? 'Normalized to the issue card slugs before validation.',
  };
}

function findSlot(slots: { slug: string; prompt: string; altText: string }[], slug: string) {
  return slots.find((slot) => slot.slug === slug);
}

function normalizeCoverSlot(slot: { prompt: string; altText: string }) {
  return {
    prompt: normalizePromptBackground(slot.prompt),
    altText: slot.altText,
  };
}

function normalizeCardSlot(
  slot: { slug: string; prompt: string; altText: string },
  card: EditOutput['trendCards'][number] | EditOutput['curatorRotations'][number],
) {
  const normalizedPrompt = normalizePromptBackground(slot.prompt);
  return {
    ...slot,
    prompt: normalizedPrompt,
    altText: checkAltText(slot.slug, slot.altText) ? fallbackAltText(card) : slot.altText,
  };
}

function fallbackSlot(card: EditOutput['trendCards'][number] | EditOutput['curatorRotations'][number]) {
  const garment = garmentForKind(card.kind);
  const color = colorForKind(card.kind);
  return {
    slug: card.slug,
    prompt: [
      `${color} ${garment}, ${card.deck.toLowerCase()}.`,
      'True black void background, #000000, no gradient, no color cast.',
      'Garment-only editorial product photograph, magazine quality, sharp focus on textile and cut.',
    ].join(' '),
    altText: fallbackAltText(card),
  };
}

function fallbackAltText(card: EditOutput['trendCards'][number] | EditOutput['curatorRotations'][number]): string {
  const garment = garmentForKind(card.kind);
  const color = colorForKind(card.kind);
  return `${color} ${garment}, ${card.deck.toLowerCase()} — ${card.headline.toLowerCase()}`;
}

function normalizePromptBackground(prompt: string): string {
  const compositionSafe = prompt
    .replace(/\bfrom above\b/gi, 'from a three-quarter angle')
    .replace(/\btop[- ]down\b/gi, 'three-quarter')
    .replace(/\boverhead view\b/gi, 'front-facing editorial view')
    .replace(/\bflat[- ]?lay\b/gi, 'garment-only studio photograph')
    .replace(/\blaid flat\b/gi, 'structured on a studio form')
    .replace(/\bbirds-eye\b/gi, 'front-facing')
    .replace(/\bbird's-eye\b/gi, 'front-facing')
    .replace(/\bbirdseye\b/gi, 'front-facing');

  const withMagazineBackground = compositionSafe
    .replace(/warm off-white seamless studio,?\s*no texture\.?/gi, 'True black void background, #000000, no gradient, no color cast.')
    .replace(/bone background,?\s*#FAFAFA,?\s*no texture,?\s*no color cast\.?/gi, 'True black void background, #000000, no gradient, no color cast.');

  if (/true black void background/i.test(withMagazineBackground)) return withMagazineBackground;
  return `${withMagazineBackground} True black void background, #000000, no gradient, no color cast.`;
}

function garmentForKind(kind: EditOutput['trendCards'][number]['kind']): string {
  const map: Record<typeof kind, string> = {
    jacket: 'wool jacket',
    tee: 'cotton tee',
    denim: 'denim jeans',
    trouser: 'wool trouser',
    skirt: 'wool skirt',
    boot: 'leather boot',
    sneaker: 'leather sneaker',
    oxford: 'leather oxford shoe',
    cap: 'cotton cap',
  };
  return map[kind];
}

function colorForKind(kind: EditOutput['trendCards'][number]['kind']): string {
  if (kind === 'denim') return 'Dark indigo';
  if (kind === 'boot' || kind === 'oxford' || kind === 'sneaker') return 'Black';
  if (kind === 'cap' || kind === 'tee') return 'White';
  return 'Charcoal';
}

function stripMotionContradictions(prompt: string): string {
  return prompt
    .replace(/\b(?:slow\s+)?(?:180|360)[-\s]?degree rotation\b/gi, 'static editorial product frame')
    .replace(/\bno static frame\b/gi, 'no camera motion')
    .replace(/\bno camera static treatment\b/gi, 'no camera motion')
    .replace(/\brotation\b/gi, 'static frame')
    .replace(/\bmotion\b/gi, 'static treatment')
    .replace(/\bcamera move\b/gi, 'locked camera');
}
