import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { BRAND_PREAMBLE, designMd } from '../lib/context.js';
import { recordCost, recordWebSearchCost, exceededWebSearchCap, getWebSearchCost } from '../lib/cost.js';
import { archiveSources, findFreshSources } from '../lib/archive.js';
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

const ARCHIVE_FRESH_DAYS = 7;
const ARCHIVE_MIN_SOURCES = 15;

function deriveKeywords(input: ResearchInput): string[] {
  if (!input.runConfig.seedTrend) return [];
  return input.runConfig.seedTrend
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

async function tryArchive(input: ResearchInput): Promise<{ narrative: string; sources: Source[] } | null> {
  const keywords = deriveKeywords(input);
  if (keywords.length === 0) {
    console.log('[research/archive] no seed trend → skipping archive lookup, running web search');
    return null;
  }

  const fresh = await findFreshSources({
    trendKeywords: keywords,
    freshDays: ARCHIVE_FRESH_DAYS,
    limit: 30,
  });

  if (fresh.length < ARCHIVE_MIN_SOURCES) {
    console.log(
      `[research/archive] ${fresh.length} sources match seed '${input.runConfig.seedTrend}' ` +
      `(threshold ${ARCHIVE_MIN_SOURCES}). Running web search.`,
    );
    return null;
  }

  console.log(
    `[research/archive] HIT — ${fresh.length} sources match seed '${input.runConfig.seedTrend}'. ` +
    `Skipping web search.`,
  );

  const sources: Source[] = fresh.map((row) => ({
    title: row.title,
    url: row.url,
    publisher: row.publisher,
    observedAt: row.last_seen_at,
    signalType: row.signal_type,
  }));

  // Build a narrative from archived metadata. Structuring stage will turn
  // this into TrendCandidates the same way it does for fresh search output.
  const narrative = [
    `## Archived sources for trend '${input.runConfig.seedTrend}'`,
    `Date range: ${input.runConfig.dateRange}`,
    `Audience tracks: ${input.runConfig.audienceTracks.join(', ')}`,
    '',
    'These sources were gathered from prior research runs and are still fresh',
    `(within ${ARCHIVE_FRESH_DAYS} days). No new web search was performed for this run.`,
    '',
    ...fresh.map((row) => {
      const snippet = row.raw_snippet ? ` — ${row.raw_snippet.slice(0, 200)}` : '';
      return `- [${row.signal_type}] ${row.title} (${row.publisher})${snippet}`;
    }),
  ].join('\n');

  return { narrative, sources };
}

export async function runResearch(input: ResearchInput): Promise<ResearchOutput> {
  // ── Archive check — skip web search entirely when archive is fresh ───────
  const archived = await tryArchive(input);
  if (archived) {
    return await structureNarrative(archived.narrative, archived.sources);
  }

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
  // System prompt is split into a cached prefix (BRAND_PREAMBLE +
  // DESIGN.md excerpt — stable across runs) and is the only content here.
  // After first call, subsequent runs read this at 0.1× input cost.
  const cachedSystem = [
    BRAND_PREAMBLE,
    '',
    '## DESIGN.md (excerpt)',
    designMd().slice(0, 3000),
  ].join('\n');

  const stream = anthropicClient.messages.stream({
    model: searchModel,
    max_tokens: 8000,
    system: [
      {
        type: 'text',
        text: cachedSystem,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
    messages: [{ role: 'user', content: searchPrompt }],
  });

  stream.on('text', (delta) => process.stdout.write(delta));
  const searchResponse = await stream.finalMessage();
  process.stdout.write('\n');

  // Pull narrative text + grounded sources from the response
  const { narrative, sources } = extractResearch(searchResponse);

  // Cost = input tokens + output tokens + web search query fee.
  // Anthropic bills $0.01 per query (not per source). Count actual queries
  // by looking for server_tool_use blocks in the response.
  const queryCount = searchResponse.content.filter(
    (b: Anthropic.Messages.ContentBlock) => b.type === 'server_tool_use',
  ).length;

  const cacheRead = searchResponse.usage.cache_read_input_tokens ?? 0;
  const cacheWrite = searchResponse.usage.cache_creation_input_tokens ?? 0;
  const uncachedInput = Math.max(0, searchResponse.usage.input_tokens - cacheRead - cacheWrite);

  const tokenCost =
    (uncachedInput * 0.000003) +
    (cacheWrite * 0.000003 * 1.25) +
    (cacheRead * 0.000003 * 0.1) +
    (searchResponse.usage.output_tokens * 0.000015);
  const searchFee = queryCount * 0.01;

  recordCost(tokenCost, 'research/search-tokens');
  recordWebSearchCost(searchFee);

  console.log(
    `[research/search] ~$${(tokenCost + searchFee).toFixed(4)} | ${queryCount} queries | ` +
    `${sources.length} sources | ${searchResponse.usage.input_tokens}p ` +
    `(uncached:${uncachedInput} | cache-read:${cacheRead} | cache-write:${cacheWrite}) + ` +
    `${searchResponse.usage.output_tokens}c tokens (search-fee $${searchFee.toFixed(4)} | ` +
    `cumulative web-search $${getWebSearchCost().toFixed(4)})`,
  );

  // Salvage path: if web search cap was exceeded, do not run additional
  // search rounds — proceed with whatever sources we have. If we got zero
  // sources AND we are over the cap, the run is unsalvageable.
  if (exceededWebSearchCap()) {
    if (sources.length === 0) {
      throw new Error(
        `Web search cap exceeded ($${getWebSearchCost().toFixed(4)}) with zero sources gathered. ` +
        `Cannot proceed.`,
      );
    }
    console.warn(
      `[research/search] WEB SEARCH CAP EXCEEDED ($${getWebSearchCost().toFixed(4)}). ` +
      `Salvaging the ${sources.length} sources gathered so far. No further searches.`,
    );
  }

  // Persist new sources into the archive for future runs to reuse.
  // Use the seed trend (or a placeholder) as the keyword tag.
  const trendKeywords = deriveKeywords(input);
  if (trendKeywords.length > 0 && sources.length > 0) {
    const { inserted, updated } = await archiveSources({
      sources,
      trendKeywords,
      runId: input.runConfig.runId,
    });
    console.log(`[research/archive] saved ${inserted} new + ${updated} refreshed sources to archive`);
  }

  // ── Stage 2: structure the narrative into typed candidates ────────────────
  // Wait briefly to avoid stacking against the per-minute rate limit. The
  // search call may have spent 200K+ input tokens behind the scenes (web
  // search results count against the same window).
  await new Promise((resolve) => setTimeout(resolve, 25_000));

  return await structureNarrative(narrative, sources);
}

// Stage 2 is identical whether the narrative came from a web search or
// from the archive. Extracted so both paths use the same code.
async function structureNarrative(narrative: string, sources: Source[]): Promise<ResearchOutput> {
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
  recordCost(stage2Cost, 'research/structure');
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
