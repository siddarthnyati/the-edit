import { persistManifest } from '../lib/supabase.js';
import type { EditOutput } from './edit.js';
import type { PromptOutput } from './prompt.js';
import type { ResearchOutput } from './research.js';
import type { RunConfig, MagazineIssueManifest } from '../orchestrator/types.js';

export type PublishInput = {
  runConfig: RunConfig;
  draft: EditOutput;
  prompts: PromptOutput;
  research: ResearchOutput;
  volume: number;
  assetPaths: MagazineIssueManifest['assetPaths'];
};

export type PublishOutput = {
  manifest: MagazineIssueManifest;
  publishedAt: string;
};

// Publisher does not create copy or prompts — it assembles the approved
// artifact and writes it to Supabase. All creative work must be done before this.
export async function runPublish(input: PublishInput): Promise<PublishOutput> {
  const publishedAt = new Date().toISOString();

  const manifest: MagazineIssueManifest = {
    slug: input.draft.cover.slug,
    volume: input.volume,
    publishDate: publishedAt,
    dateRange: input.runConfig.dateRange,
    register: 'Magazine',
    trend: input.draft.concept.split('.')[0] ?? input.draft.cover.headline,
    trendKeywords: input.draft.trendCards.map((c) => c.headline),
    eraReference: input.draft.trendCards[0]?.deck ?? '',
    audienceTracks: input.runConfig.audienceTracks,
    coverTreatment: 'scroll_sequence',
    assetPaths: input.assetPaths,
    sourceSummary: input.research.researchNotes,
    qaStatus: 'approved',
  };

  await persistManifest(manifest);

  console.log(`[publish] manifest written — slug: ${manifest.slug}`);

  return { manifest, publishedAt };
}
