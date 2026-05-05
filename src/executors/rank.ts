import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { BRAND_PREAMBLE } from '../lib/context.js';
import { recordCost } from '../lib/cost.js';
import type { ResearchOutput } from './research.js';
import type { RunConfig } from '../orchestrator/types.js';

const RankedIssueSchema = z.object({
  winningTrend: z.string(),
  eraReference: z.string(),
  rationale: z.string().describe('Why this trend wins over the others this week'),
  trendStories: z.array(z.object({
    angle: z.string().describe('The specific styling or cultural angle for this story'),
    headline: z.string().describe('Magazine-register headline, uppercase, declarative'),
    deck: z.string().describe('Italic subtitle in Magazine voice'),
    audienceFocus: z.enum(['man', 'woman', 'non-binary', 'all']),
  })).length(3),
  rejectedTrends: z.array(z.object({
    trend: z.string(),
    reason: z.string(),
  })),
  scores: z.record(z.string(), z.object({
    returnSignal: z.number().min(0).max(10),
    stylingUsefulness: z.number().min(0).max(10),
    visualFeasibility: z.number().min(0).max(10),
    brandFit: z.number().min(0).max(10),
  })),
});

export type RankInput = {
  runConfig: RunConfig;
  research: ResearchOutput;
};

export type RankOutput = z.infer<typeof RankedIssueSchema>;

export async function runRank(input: RankInput): Promise<RankOutput> {
  const model = process.env['MAGAZINE_RANK_MODEL'] ?? 'claude-sonnet-4-6';

  const { object, usage } = await generateObject({
    model: anthropic(model),
    schema: RankedIssueSchema,
    system: BRAND_PREAMBLE,
    prompt: [
      `Audience tracks: ${input.runConfig.audienceTracks.join(', ')}`,
      '',
      '## Research candidates',
      JSON.stringify(input.research.candidates, null, 2),
      '',
      '## Research notes',
      input.research.researchNotes,
      '',
      'Score each candidate on: return signal, styling usefulness, visual feasibility, brand fit (0-10 each).',
      'Select one winner and define three distinct trend stories under it.',
      'Each story must be a different angle — not the same story told three times.',
      'Reject the rest with one clear reason each.',
    ].join('\n'),
  });

  const estimatedCostUsd = (usage.promptTokens * 0.000003) + (usage.completionTokens * 0.000015);
  recordCost(estimatedCostUsd, 'rank');
  console.log(`[rank] ~$${estimatedCostUsd.toFixed(4)} | ${usage.promptTokens}p + ${usage.completionTokens}c tokens`);

  return object;
}
