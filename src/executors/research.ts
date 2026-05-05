import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { BRAND_PREAMBLE, designMd } from '../lib/context.js';
import type { RunConfig, Source } from '../orchestrator/types.js';

// ---------------------------------------------------------------------------
// Stage 1: web search via raw Anthropic SDK (server-side tool with citations)
// Stage 2: structure the research into typed candidates via Vercel AI + Zod
// ---------------------------------------------------------------------------

const TrendCandidateSchema = z.object({
  trend: z.string(),
  eraReference: z.string().describe('The decade or moment this trend returns from'),
  currentSignalSummary: z.string().describe('Why it is returning now, in 1-2 sentences'),
  confidenceNote: z.string().describe('How strong the evidence is and what is missing'),
  sourceGaps: z.array(z.string()).describe('Signal types with insufficient evidence'),
});

const StructuredResearchSchema = z.object({
  candidates: z.array(TrendCandidateSchema).min(2).max(5),
  researchNotes: z.string().describe('Source quality, gaps, anything ranking should know'),
});

export type ResearchInput = {
  runConfig: RunConfig;
  priorIssueSlugs: string[];
};

export type ResearchOutput = z.infer<typeof StructuredResearchSchema> & {
  sources: Source[];
};

const anthropicClient = new Anthropic();

export async function runResearch(input: ResearchInput): Promise<ResearchOutput> {
  // ── Stage 1: grounded web search ──────────────────────────────────────────
  const searchPrompt = [
    `Date range: ${input.runConfig.dateRange}`,
    `Audience tracks: ${input.runConfig.audienceTracks.join(', ')}`,
    input.runConfig.seedTrend ? `Seed trend hint: ${input.runConfig.seedTrend}` : '',
    `Prior issues to avoid reusing: ${input.priorIssueSlugs.join(', ') || 'none'}`,
    '',
    'Use web search to find evidence for exactly 3 fashion trends that are returning',
    'from a prior era. Run no more than 5 total searches — be efficient.',
    'For each trend, give a short paragraph covering:',
    '- the era it returns from (decade or specific cultural moment)',
    '- 1-2 strong editorial or runway signals from the last 90 days',
    '- styling angle relevant to a foundation wardrobe (denim, tees, leather)',
    '- evidence gaps (what type of source you could not find)',
    '',
    'Keep total output under 2000 words. Cite every factual claim.',
    'No login-walled content, no unsourced influencer screenshots.',
  ].filter(Boolean).join('\n');

  const searchModel = process.env['MAGAZINE_RESEARCH_MODEL'] ?? 'claude-sonnet-4-6';

  // Stream the search call. Web search may issue multiple sub-requests under
  // the hood, and a non-streaming call frequently exceeds the SDK's idle
  // timeout. Streaming keeps the connection alive while Claude works.
  // max_uses caps how many search queries Claude runs — without it, an
  // unconstrained run can pull in 200+ sources and blow the rate limit.
  const stream = anthropicClient.messages.stream({
    model: searchModel,
    max_tokens: 8000,
    system: [BRAND_PREAMBLE, '', '## DESIGN.md (excerpt)', designMd().slice(0, 3000)].join('\n'),
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
    messages: [{ role: 'user', content: searchPrompt }],
  });

  stream.on('text', (delta) => process.stdout.write(delta));
  const searchResponse = await stream.finalMessage();
  process.stdout.write('\n');

  // Pull narrative text + grounded sources from the response
  const { narrative, sources } = extractResearch(searchResponse);

  const stage1Cost =
    (searchResponse.usage.input_tokens * 0.000003) +
    (searchResponse.usage.output_tokens * 0.000015);
  console.log(
    `[research/search] ~$${stage1Cost.toFixed(4)} | ${sources.length} sources | ` +
    `${searchResponse.usage.input_tokens}p + ${searchResponse.usage.output_tokens}c tokens`,
  );

  // ── Stage 2: structure the narrative into typed candidates ────────────────
  // Wait briefly to avoid stacking against the per-minute rate limit. The
  // search call may have spent 200K+ input tokens behind the scenes (web
  // search results count against the same window).
  await new Promise((resolve) => setTimeout(resolve, 25_000));

  // Trim the narrative to keep stage 2 inside the rate window. We only need
  // the structural skeleton, not the full editorial copy or the citations.
  const trimmed = narrative.length > 8000 ? narrative.slice(0, 8000) + '\n[truncated]' : narrative;

  const structureModel = process.env['MAGAZINE_RESEARCH_MODEL'] ?? 'claude-sonnet-4-6';
  const { object, usage } = await generateObject({
    model: anthropic(structureModel),
    schema: StructuredResearchSchema,
    prompt: [
      'Convert the research narrative below into 3 trend candidates.',
      'Each candidate must have a clear era reference and a current signal summary.',
      'If sources for a candidate are weak, list the gaps explicitly.',
      '',
      '## Research narrative',
      trimmed,
    ].join('\n'),
  });

  const stage2Cost = (usage.promptTokens * 0.000003) + (usage.completionTokens * 0.000015);
  console.log(`[research/structure] ~$${stage2Cost.toFixed(4)} | ${usage.promptTokens}p + ${usage.completionTokens}c tokens`);

  return { ...object, sources };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractResearch(response: Anthropic.Messages.Message): {
  narrative: string;
  sources: Source[];
} {
  const narrativeParts: string[] = [];
  const sources: Source[] = [];
  const seenUrls = new Set<string>();
  const observedAt = new Date().toISOString();

  for (const block of response.content) {
    if (block.type === 'text') {
      narrativeParts.push(block.text);
    }

    // web_search_tool_result blocks carry the actual search hits Claude saw.
    // Each result is { type: 'web_search_result', url, title, page_age, encrypted_content }
    if (block.type === 'web_search_tool_result') {
      const results = Array.isArray(block.content) ? block.content : [];
      for (const r of results) {
        if (r.type !== 'web_search_result') continue;
        if (seenUrls.has(r.url)) continue;
        seenUrls.add(r.url);
        sources.push({
          title: r.title,
          url: r.url,
          publisher: extractPublisher(r.url),
          observedAt,
          signalType: classifySignal(r.url),
        });
      }
    }
  }

  return { narrative: narrativeParts.join('\n\n'), sources };
}

function extractPublisher(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host;
  } catch {
    return 'unknown';
  }
}

function classifySignal(url: string): Source['signalType'] {
  const host = extractPublisher(url).toLowerCase();
  if (host.includes('vogue') || host.includes('hypebeast') || host.includes('businessoffashion') || host.includes('wmagazine') || host.includes('elle') || host.includes('harpers')) {
    return 'editorial';
  }
  if (host.includes('grailed') || host.includes('depop') || host.includes('vestiaire') || host.includes('therealreal')) {
    return 'resale';
  }
  if (host.includes('ssense') || host.includes('mrporter') || host.includes('endclothing') || host.includes('matches')) {
    return 'retail';
  }
  if (host.includes('runway') || host.includes('fashionweek')) {
    return 'runway';
  }
  if (host.includes('google') || host.includes('trends')) {
    return 'search';
  }
  return 'editorial';
}
