import { persistManifest } from '../lib/supabase.js';
import type { EditOutput } from './edit.js';
import type { PromptOutput } from './prompt.js';
import type { ResearchOutput } from './research.js';
import type { RankOutput } from './rank.js';
import type {
  AppMagazineIssuePayload,
  AppMagazineSurface,
  MagazineIssueManifest,
  RunConfig,
} from '../orchestrator/types.js';

export type PublishInput = {
  runConfig: RunConfig;
  draft: EditOutput;
  prompts: PromptOutput;
  research: ResearchOutput;
  ranked?: RankOutput;
  volume: number;
  assetPaths: MagazineIssueManifest['assetPaths'];
};

export type PublishOutput = {
  manifest: MagazineIssueManifest;
  publishedAt: string;
};

function buildIssuePayload(input: PublishInput, publishedAt: string): AppMagazineIssuePayload {
  const trend = input.ranked?.winningTrend ?? input.draft.concept.split('.')[0] ?? input.draft.cover.headline;
  const history = input.ranked?.eraReference ?? input.draft.trendCards[0]?.deck ?? '';
  const sourceSummary = publicSourceSummary(input.research, input.runConfig.audienceTracks);
  const whyNow = publicWhyNow(trend);
  const audiencePersona = input.runConfig.audienceTracks.join(' / ');

  const cover: AppMagazineSurface = {
    slug: input.draft.cover.slug,
    section: 'cover',
    eyebrow: input.draft.cover.eyebrow,
    headline: input.draft.cover.headline,
    deck: input.draft.cover.deck,
    body: input.draft.concept,
    kind: input.draft.trendCards[0]?.kind ?? 'jacket',
    baseSelectionIds: input.draft.curatorRotations[0]?.baseSelectionIds ?? [],
    imagePath: input.assetPaths.coverStart,
    history,
    whyNow,
    sourceSummary,
  };

  const trendCards: AppMagazineSurface[] = input.draft.trendCards.map((card, index) => ({
    slug: card.slug,
    section: 'trend',
    eyebrow: card.eyebrow,
    headline: card.headline,
    deck: card.deck,
    body: card.body,
    kind: card.kind,
    baseSelectionIds: [],
    imagePath: input.assetPaths.trendCards[index] ?? '',
    history,
    whyNow,
    sourceSummary,
  }));

  const curatorCards: AppMagazineSurface[] = input.draft.curatorRotations.map((card, index) => ({
    slug: card.slug,
    section: 'curator',
    eyebrow: card.eyebrow,
    headline: card.headline,
    deck: card.deck,
    body: card.body,
    kind: card.kind,
    baseSelectionIds: card.baseSelectionIds,
    imagePath: input.assetPaths.curatorCards[index] ?? '',
    history,
    whyNow,
    sourceSummary,
  }));

  return {
    slug: input.draft.cover.slug,
    volume: input.volume,
    publishDate: publishedAt,
    title: input.draft.cover.headline,
    trend,
    audiencePersona,
    cover,
    trendCards,
    curatorCards,
    surfaces: [cover, ...trendCards, ...curatorCards],
    history,
    whyNow,
    sourceSummary,
    sourceCount: input.research.sources.length,
    assetPaths: input.assetPaths,
  };
}

function publicWhyNow(trend: string): string {
  return [
    `Recent fashion coverage keeps returning to ${trend}: sharper proportion, visible construction, and styling built around silhouette rather than decoration.`,
    'The strongest public signal is the repeated editorial return of the shape, not a single designer count or market claim.',
  ].join(' ');
}

function publicSourceSummary(research: ResearchOutput, audienceTracks: string[]): string {
  const publishers = Array.from(new Set(
    research.sources.map((source) => source.publisher).filter(Boolean),
  )).slice(0, 6);
  const sourceLine = publishers.length > 0
    ? `Research draws on current coverage from ${publishers.join(', ')}.`
    : 'Research draws on current editorial and trend coverage.';
  return [
    sourceLine,
    'App-facing copy keeps sourced trend signals separate from styling perspective.',
    `${audienceTracks.join(' / ')} surfaces should be read as editorial styling lenses unless a source explicitly proves market adoption.`,
  ].join(' ');
}

// Publisher does not create copy or prompts — it assembles the approved
// artifact and writes it to Supabase. All creative work must be done before this.
export async function runPublish(input: PublishInput): Promise<PublishOutput> {
  const publishedAt = new Date().toISOString();
  const issuePayload = buildIssuePayload(input, publishedAt);

  const manifest: MagazineIssueManifest = {
    runId: input.runConfig.runId,
    slug: input.draft.cover.slug,
    volume: input.volume,
    publishDate: publishedAt,
    dateRange: input.runConfig.dateRange,
    register: 'Magazine',
    trend: issuePayload.trend,
    trendKeywords: input.draft.trendCards.map((c) => c.headline),
    eraReference: issuePayload.history,
    audienceTracks: input.runConfig.audienceTracks,
    coverTreatment: 'scroll_sequence',
    assetPaths: input.assetPaths,
    sourceSummary: issuePayload.sourceSummary,
    qaStatus: 'approved',
    issuePayload,
  };

  await persistManifest(manifest);

  console.log(`[publish] manifest written — slug: ${manifest.slug}`);

  return { manifest, publishedAt };
}
