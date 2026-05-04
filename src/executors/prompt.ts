import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { BRAND_PREAMBLE } from '../lib/context.js';
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
  })),
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
      'Asset rules:',
      '- All imagery is on --void true black background unless the garment requires contrast.',
      '- No AI-generated human faces. Garment-focused, editorial, studio quality.',
      '- No stock photography aesthetics. No glassmorphism. No decorative illustration.',
      '- Cover motion: exactly one Kling prompt, 5 seconds, garment transformation or material reveal.',
      '- Static cards: Nano Banana prompts only.',
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
      'One motion cover (Kling). All other assets are static (Nano Banana).',
      'Write alt text in editorial voice — not captions.',
    ].join('\n'),
  });

  const estimatedCostUsd = (usage.promptTokens * 0.000003) + (usage.completionTokens * 0.000015);
  console.log(`[prompt] ~$${estimatedCostUsd.toFixed(4)} | ${usage.promptTokens}p + ${usage.completionTokens}c tokens`);

  return object;
}
