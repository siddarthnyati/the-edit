import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { BRAND_PREAMBLE, designMd } from '../lib/context.js';
import type { RunConfig, Source } from '../orchestrator/types.js';

const TrendCandidateSchema = z.object({
  trend: z.string(),
  eraReference: z.string().describe('The decade or moment this trend returns from'),
  currentSignalSummary: z.string().describe('Why it is returning now, in 1-2 sentences'),
  confidenceNote: z.string().describe('How strong the evidence is and what is missing'),
  sourceGaps: z.array(z.string()).describe('Signal types with insufficient evidence'),
});

const ResearchOutputSchema = z.object({
  candidates: z.array(TrendCandidateSchema).min(2).max(5),
  sourcesUsed: z.array(z.object({
    title: z.string(),
    url: z.string(),
    publisher: z.string(),
    observedAt: z.string(),
    signalType: z.enum(['editorial', 'runway', 'retail', 'resale', 'search', 'social', 'archive']),
  })),
  researchNotes: z.string().describe('Anything the ranker or editor should know about source quality'),
});

export type ResearchInput = {
  runConfig: RunConfig;
  priorIssueSlugs: string[];
};

export type ResearchOutput = z.infer<typeof ResearchOutputSchema> & {
  sources: Source[];
};

export async function runResearch(input: ResearchInput): Promise<ResearchOutput> {
  const model = process.env['MAGAZINE_RESEARCH_MODEL'] ?? 'claude-sonnet-4-6';

  const { object, usage } = await generateObject({
    model: anthropic(model),
    schema: ResearchOutputSchema,
    system: [
      BRAND_PREAMBLE,
      '',
      '## DESIGN.md (excerpt)',
      designMd().slice(0, 6000),
    ].join('\n'),
    prompt: [
      `Date range: ${input.runConfig.dateRange}`,
      `Audience tracks: ${input.runConfig.audienceTracks.join(', ')}`,
      input.runConfig.seedTrend ? `Seed trend hint: ${input.runConfig.seedTrend}` : '',
      `Prior issues (avoid reuse): ${input.priorIssueSlugs.join(', ') || 'none'}`,
      '',
      'Research 2-5 trend candidates that show clear return signals from a prior era.',
      'For each candidate, identify the era it returns from, the current signal, and evidence gaps.',
      'Use only editorial, runway, retail, resale, search, and archive signals.',
      'Mark any claim without grounding as unsupported.',
    ].filter(Boolean).join('\n'),
  });

  const estimatedCostUsd = (usage.promptTokens * 0.000003) + (usage.completionTokens * 0.000015);
  console.log(`[research] ~$${estimatedCostUsd.toFixed(4)} | ${usage.promptTokens}p + ${usage.completionTokens}c tokens`);

  return {
    ...object,
    sources: object.sourcesUsed,
  };
}
