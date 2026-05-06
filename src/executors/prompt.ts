import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { BRAND_PREAMBLE } from '../lib/context.js';
import { recordCost } from '../lib/cost.js';
import type { EditOutput } from './edit.js';
import type { RankOutput } from './rank.js';

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
    durationSeconds: z.literal(5),
    altText: z.string(),
  }),
  trendCardPrompts: z.array(z.object({
    slug: z.string(),
    prompt: z.string(),
    altText: z.string(),
  })).length(3),
  curatorCardPrompts: z.array(z.object({
    slug: z.string(),
    prompt: z.string(),
    altText: z.string(),
  })).min(1).max(2),
  promptNotes: z.string().describe('Any constraints or alternatives the human running these tools should know'),
});

export type PromptInput = {
  draft: EditOutput;
  ranked: RankOutput;
};

export type PromptOutput = z.infer<typeof AssetPromptSuiteSchema>;

export async function runPrompt(input: PromptInput): Promise<PromptOutput> {
  const model = process.env['MAGAZINE_PROMPT_MODEL'] ?? 'claude-sonnet-4-6';

  const { object, usage } = await generateObject({
    model: anthropic(model),
    schema: AssetPromptSuiteSchema,
    system: [
      BRAND_PREAMBLE,
      '',
      'Asset rules — apply strictly. QA will reject any prompt that violates them:',
      '',
      'COMPOSITION:',
      '- Imagery is editorial Zara-style: garment ON a model, void or minimalist studio background.',
      '- The model is the canvas; the garment is the subject. Lighting reveals the garment, not the model.',
      '- Default to walking poses, three-quarter angles, profile, or back views. Static front-facing OK as variants.',
      '- The imagine executor injects per-variant camera angles automatically. Your job: describe the GARMENT and SETTING, leave camera/pose generic.',
      '',
      'DEMOGRAPHIC DIVERSITY (mandatory):',
      '- The imagine executor automatically rotates model demographics (Black, White, East Asian, Latina) across variants.',
      '- Your prompt should NEVER specify a single demographic — leave it open so the rotation works.',
      '- Vary heights, body types, ages (mid-20s to mid-50s) implicitly through editorial framing.',
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
      '',
      'PROMPT STYLE:',
      '- Lead with the garment description: cut, fabric, color, era reference.',
      '- Then setting: studio lighting type, background tone.',
      '- End with editorial register cues: "magazine quality", "editorial sharp focus on textile".',
      '- Cover motion: defer for V2. Use static rendered_hero treatment — single hero garment on model.',
      '- Alt text must be editorial voice, not descriptive captions.',
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
      'Generate the full asset prompt suite for this issue.',
      'Each prompt MUST include explicit instructions: no flat-lay, no top-down, no brand logos, no anatomical close-ups.',
      'Vary the suggested camera angle across variants (front / three-quarter / profile / back).',
      'Write alt text in editorial voice — not captions.',
    ].join('\n'),
  });

  const estimatedCostUsd = (usage.promptTokens * 0.000003) + (usage.completionTokens * 0.000015);
  recordCost(estimatedCostUsd, 'prompt');
  console.log(`[prompt] ~$${estimatedCostUsd.toFixed(4)} | ${usage.promptTokens}p + ${usage.completionTokens}c tokens`);

  return object;
}
