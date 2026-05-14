import { getSupabaseAdmin } from '@/lib/supabase';

export const REQUIRED_SLOTS = [
  'cover-start',
  'cover-end',
  'trend-1',
  'trend-2',
  'trend-3',
  'curator-1',
  'curator-2',
] as const;

type JsonObject = Record<string, unknown>;

export type Variant = {
  id: number;
  run_id: string;
  slot: string;
  variant_index: number;
  storage_path: string;
  picked: boolean;
  prompt: string;
  alt_text: string | null;
};

export type RunStep = {
  run_id: string;
  step: string;
  status: string;
  input: unknown;
  output: unknown;
  model_provider: string | null;
  model_name: string | null;
  estimated_cost_usd: number | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type IssueCard = {
  slug: string;
  eyebrow?: string;
  headline: string;
  deck: string;
  body: string;
  kind: string;
  section: 'cover' | 'trend' | 'curator';
  baseSelectionIds?: string[];
};

export type IssueDraft = {
  concept: string;
  cover: {
    eyebrow: string;
    headline: string;
    deck: string;
    slug: string;
  };
  trendCards: IssueCard[];
  curatorRotations: IssueCard[];
};

export type PromptSuite = {
  coverStart?: { prompt?: string; altText?: string };
  coverEnd?: { prompt?: string; altText?: string };
  coverMotion?: { prompt?: string; altText?: string };
  trendCardPrompts?: Array<{ slug: string; prompt: string; altText?: string }>;
  curatorCardPrompts?: Array<{ slug: string; prompt: string; altText?: string }>;
  promptNotes?: string;
};

export type RunArtifacts = {
  runId: string;
  steps: RunStep[];
  variants: Variant[];
  draft?: IssueDraft;
  prompts?: PromptSuite;
  research?: JsonObject;
  rank?: JsonObject;
  qa?: JsonObject;
  totalCost: number;
  pickedCount: number;
  variantsCount: number;
  missingSlots: string[];
  qaApproved: boolean;
  publishReady: boolean;
  latestStepAt: string;
};

export type AppMagazineSurface = IssueCard & {
  imagePath?: string;
  imageUrl?: string;
  history?: string;
  whyNow?: string;
  sourceSummary?: string;
};

export type AppMagazineIssue = {
  slug: string;
  volume: number;
  publishDate: string;
  title: string;
  trend: string;
  audiencePersona: string;
  cover: AppMagazineSurface;
  trendCards: AppMagazineSurface[];
  curatorCards: AppMagazineSurface[];
  surfaces: AppMagazineSurface[];
  history: string;
  whyNow: string;
  sourceSummary: string;
  sourceCount: number;
};

export type RunSummary = {
  run_id: string;
  run_status?: string;
  current_step?: string | null;
  step_count: number;
  qa_status: string;
  qa_approved: boolean;
  total_cost: number;
  variants_count: number;
  picked_count: number;
  missing_count: number;
  latest_step_at: string;
  headline: string;
  published: boolean;
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asDraft(value: unknown): IssueDraft | undefined {
  const obj = asObject(value);
  if (!obj.cover || !Array.isArray(obj.trendCards)) return undefined;
  return value as IssueDraft;
}

function asPrompts(value: unknown): PromptSuite | undefined {
  const obj = asObject(value);
  if (!obj.coverStart && !obj.trendCardPrompts) return undefined;
  return value as PromptSuite;
}

function stepOutput<T>(steps: RunStep[], name: string): T | undefined {
  return steps.find((step) => step.step === name && step.status === 'complete')?.output as T | undefined;
}

function signedPath(path: string): string {
  return path.replace(/^magazine-assets\//, '');
}

export async function createSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  if (!path) return '';
  const { data, error } = await getSupabaseAdmin().storage
    .from('magazine-assets')
    .createSignedUrl(signedPath(path), expiresInSeconds);

  return error ? '' : data.signedUrl;
}

export async function loadRunArtifacts(runId: string): Promise<RunArtifacts> {
  const supabaseAdmin = getSupabaseAdmin();
  const [stepsResult, variantsResult] = await Promise.all([
    supabaseAdmin
      .from('magazine_run_steps')
      .select('run_id, step, status, input, output, model_provider, model_name, estimated_cost_usd, error, created_at, completed_at')
      .eq('run_id', runId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('magazine_image_variants')
      .select('id, run_id, slot, variant_index, storage_path, picked, prompt, alt_text')
      .eq('run_id', runId)
      .order('slot', { ascending: true })
      .order('variant_index', { ascending: true }),
  ]);

  if (stepsResult.error) throw new Error(stepsResult.error.message);
  if (variantsResult.error) throw new Error(variantsResult.error.message);

  const steps = (stepsResult.data ?? []) as RunStep[];
  const variants = (variantsResult.data ?? []) as Variant[];
  const pickedSlots = new Set(variants.filter((variant) => variant.picked).map((variant) => variant.slot));
  const missingSlots = REQUIRED_SLOTS.filter((slot) => !pickedSlots.has(slot));
  const qa = asObject(stepOutput(steps, 'qa'));
  const verdict = String(qa.verdict ?? '');
  const totalCost = steps.reduce((sum, step) => sum + (Number(step.estimated_cost_usd) || 0), 0);

  return {
    runId,
    steps,
    variants,
    draft: asDraft(stepOutput(steps, 'edit')),
    prompts: asPrompts(stepOutput(steps, 'prompt')),
    research: asObject(stepOutput(steps, 'research')),
    rank: asObject(stepOutput(steps, 'rank')),
    qa,
    totalCost,
    pickedCount: variants.filter((variant) => variant.picked).length,
    variantsCount: variants.length,
    missingSlots,
    qaApproved: verdict === 'approve',
    publishReady: verdict === 'approve' && missingSlots.length === 0,
    latestStepAt: steps.at(-1)?.created_at ?? new Date(0).toISOString(),
  };
}

export async function loadRunSummaries(): Promise<RunSummary[]> {
  const supabaseAdmin = getSupabaseAdmin();
  const [runsResult, stepsResult] = await Promise.all([
    supabaseAdmin
      .from('magazine_runs')
      .select('run_id, status, current_step, total_cost_usd, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('magazine_run_steps')
      .select('run_id, step, status, output, estimated_cost_usd, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  if (stepsResult.error) throw new Error(stepsResult.error.message);

  const grouped = new Map<string, RunSummary>();
  if (!runsResult.error) {
    for (const row of runsResult.data ?? []) {
      grouped.set(row.run_id as string, {
        run_id: row.run_id as string,
        run_status: row.status as string,
        current_step: row.current_step as string | null,
        step_count: 0,
        qa_status: 'missing',
        qa_approved: false,
        total_cost: Number(row.total_cost_usd) || 0,
        variants_count: 0,
        picked_count: 0,
        missing_count: REQUIRED_SLOTS.length,
        latest_step_at: (row.updated_at as string) ?? (row.created_at as string),
        headline: '',
        published: false,
      });
    }
  }

  for (const row of stepsResult.data ?? []) {
    const id = row.run_id as string;
    const summary = grouped.get(id) ?? {
      run_id: id,
      run_status: undefined,
      current_step: null,
      step_count: 0,
      qa_status: 'missing',
      qa_approved: false,
      total_cost: 0,
      variants_count: 0,
      picked_count: 0,
      missing_count: REQUIRED_SLOTS.length,
      latest_step_at: row.created_at as string,
      headline: '',
      published: false,
    };

    summary.step_count += 1;
    if (!summary.run_status) summary.total_cost += Number(row.estimated_cost_usd) || 0;
    if ((row.created_at as string).localeCompare(summary.latest_step_at) > 0) {
      summary.latest_step_at = row.created_at as string;
    }
    if ((row.step as string) === 'edit') {
      const draft = asDraft(row.output);
      summary.headline = draft?.cover.headline ?? summary.headline;
    }
    if ((row.step as string) === 'qa') {
      const qa = asObject(row.output);
      summary.qa_status = String(qa.verdict ?? row.status ?? 'missing');
      summary.qa_approved = qa.verdict === 'approve';
    }
    grouped.set(id, summary);
  }

  const ids = Array.from(grouped.keys());
  if (ids.length > 0) {
    const { data: variantRows } = await supabaseAdmin
      .from('magazine_image_variants')
      .select('run_id, slot, picked')
      .in('run_id', ids);

    const pickedSlotsByRun = new Map<string, Set<string>>();
    for (const row of variantRows ?? []) {
      const id = row.run_id as string;
      const summary = grouped.get(id);
      if (!summary) continue;
      summary.variants_count += 1;
      if (row.picked) {
        summary.picked_count += 1;
        const slots = pickedSlotsByRun.get(id) ?? new Set<string>();
        slots.add(row.slot as string);
        pickedSlotsByRun.set(id, slots);
      }
    }
    for (const [id, summary] of grouped) {
      const pickedSlots = pickedSlotsByRun.get(id) ?? new Set<string>();
      summary.missing_count = REQUIRED_SLOTS.filter((slot) => !pickedSlots.has(slot)).length;
    }

    const { data: manifestRows } = await supabaseAdmin
      .from('magazine_issue_manifests')
      .select('*')
      .eq('qa_status', 'approved')
      .order('publish_date', { ascending: false })
      .limit(50);

    for (const row of manifestRows ?? []) {
      const assetPaths = asObject(row.asset_paths);
      const id = String(row.run_id ?? assetPaths.runId ?? '');
      if (id && grouped.has(id)) grouped.get(id)!.published = true;
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.latest_step_at.localeCompare(a.latest_step_at))
    .slice(0, 30);
}

function assetPathsFromPicks(variants: Variant[]) {
  const picked = new Map<string, string>();
  for (const variant of variants) {
    if (variant.picked) picked.set(variant.slot, `magazine-assets/${variant.storage_path}`);
  }

  return {
    coverStart: picked.get('cover-start') ?? '',
    coverEnd: picked.get('cover-end') ?? '',
    coverMotion: '',
    coverFrames: '',
    trendCards: [
      picked.get('trend-1') ?? '',
      picked.get('trend-2') ?? '',
      picked.get('trend-3') ?? '',
    ],
    curatorCards: [
      picked.get('curator-1') ?? '',
      picked.get('curator-2') ?? '',
    ],
  };
}

function buildIssuePayload(artifacts: RunArtifacts, volume: number, publishedAt: string): AppMagazineIssue {
  if (!artifacts.draft) throw new Error('Cannot publish: edit draft is missing.');

  const rank = artifacts.rank ?? {};
  const assetPaths = assetPathsFromPicks(artifacts.variants);
  const trend = String(rank.winningTrend ?? artifacts.draft.concept.split('.')[0] ?? artifacts.draft.cover.headline);
  const history = String(rank.eraReference ?? artifacts.draft.trendCards[0]?.deck ?? '');
  const whyNow = publicWhyNow(trend);
  const sourceSummary = publicSourceSummary(artifacts.research);
  const sourceCount = Array.isArray(artifacts.research?.sources) ? artifacts.research.sources.length : 0;

  const cover: AppMagazineSurface = {
    ...artifacts.draft.cover,
    section: 'cover',
    body: artifacts.draft.concept,
    kind: artifacts.draft.trendCards[0]?.kind ?? 'jacket',
    baseSelectionIds: artifacts.draft.curatorRotations[0]?.baseSelectionIds ?? [],
    imagePath: assetPaths.coverStart,
    history,
    whyNow,
    sourceSummary,
  };

  const trendCards = artifacts.draft.trendCards.map((card, index) => ({
    ...card,
    imagePath: assetPaths.trendCards[index],
    history,
    whyNow,
    sourceSummary,
  }));

  const curatorCards = artifacts.draft.curatorRotations.map((card, index) => ({
    ...card,
    imagePath: assetPaths.curatorCards[index],
    history,
    whyNow,
    sourceSummary,
  }));

  return {
    slug: artifacts.draft.cover.slug,
    volume,
    publishDate: publishedAt,
    title: artifacts.draft.cover.headline,
    trend,
    audiencePersona: 'man / woman / non-binary',
    cover,
    trendCards,
    curatorCards,
    surfaces: [cover, ...trendCards, ...curatorCards],
    history,
    whyNow,
    sourceSummary,
    sourceCount,
  };
}

function publicWhyNow(trend: string): string {
  return [
    `Recent fashion coverage keeps returning to ${trend}: sharper proportion, visible construction, and styling built around silhouette rather than decoration.`,
    'The strongest public signal is the repeated editorial return of the shape, not a single designer count or market claim.',
  ].join(' ');
}

function publicSourceSummary(research?: JsonObject): string {
  const sources = Array.isArray(research?.sources) ? research.sources : [];
  const publishers = Array.from(new Set(
    sources
      .map((source) => asObject(source).publisher)
      .map((publisher) => String(publisher ?? '').trim())
      .filter(Boolean),
  )).slice(0, 6);
  const sourceLine = publishers.length > 0
    ? `Research draws on current coverage from ${publishers.join(', ')}.`
    : 'Research draws on current editorial and trend coverage.';
  return [
    sourceLine,
    'App-facing copy keeps sourced trend signals separate from styling perspective.',
    'Man / woman / non-binary surfaces should be read as editorial styling lenses unless a source explicitly proves market adoption.',
  ].join(' ');
}

async function nextVolume(): Promise<number> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('magazine_issue_manifests')
    .select('volume')
    .order('volume', { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  const volume = data?.[0]?.volume;
  return typeof volume === 'number' ? volume + 1 : 19;
}

async function insertManifest(row: JsonObject): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.from('magazine_issue_manifests').insert(row);
  if (!error) return;

  const message = error.message.toLowerCase();
  if (!message.includes('issue_payload') && !message.includes('run_id')) {
    throw new Error(error.message);
  }

  const assetPaths = asObject(row.asset_paths);
  const fallbackRow: Record<string, unknown> = {
    ...row,
    asset_paths: {
      ...assetPaths,
      issuePayload: row.issue_payload,
      runId: row.run_id,
    },
  };
  delete fallbackRow.issue_payload;
  delete fallbackRow.run_id;

  const { error: fallbackError } = await supabaseAdmin
    .from('magazine_issue_manifests')
    .insert(fallbackRow);

  if (fallbackError) throw new Error(fallbackError.message);
}

export async function publishRunToApp(runId: string): Promise<{ slug: string; volume: number }> {
  const artifacts = await loadRunArtifacts(runId);
  if (!artifacts.qaApproved) throw new Error('Cannot publish: QA verdict is not approve.');
  if (artifacts.missingSlots.length > 0) {
    throw new Error(`Cannot publish: missing picks for ${artifacts.missingSlots.join(', ')}.`);
  }
  if (!artifacts.draft) throw new Error('Cannot publish: edit draft is missing.');
  if (!artifacts.prompts) throw new Error('Cannot publish: prompt suite is missing.');

  const volume = await nextVolume();
  const publishedAt = new Date().toISOString();
  const issuePayload = buildIssuePayload(artifacts, volume, publishedAt);
  const assetPaths = assetPathsFromPicks(artifacts.variants);

  await insertManifest({
    run_id: runId,
    slug: issuePayload.slug,
    volume,
    publish_date: publishedAt,
    date_range: 'weekly',
    trend: issuePayload.trend,
    trend_keywords: issuePayload.trendCards.map((card) => card.headline),
    era_reference: issuePayload.history,
    audience_tracks: ['man', 'woman', 'non-binary'],
    cover_treatment: 'scroll_sequence',
    asset_paths: assetPaths,
    source_summary: issuePayload.sourceSummary,
    qa_status: 'approved',
    issue_payload: issuePayload,
  });

  return { slug: issuePayload.slug, volume };
}

function fallbackIssueFromManifest(row: JsonObject): AppMagazineIssue {
  const assetPaths = asObject(row.asset_paths);
  const slug = String(row.slug ?? 'latest-issue');
  const publishDate = String(row.publish_date ?? new Date().toISOString());
  const volume = Number(row.volume ?? 0);
  const trend = String(row.trend ?? 'the edit');
  const sourceSummary = String(row.source_summary ?? '');
  const cover: AppMagazineSurface = {
    slug,
    section: 'cover',
    headline: trend,
    deck: String(row.era_reference ?? ''),
    body: sourceSummary,
    kind: 'jacket',
    baseSelectionIds: [],
    imagePath: String(assetPaths.coverStart ?? ''),
    history: String(row.era_reference ?? ''),
    whyNow: sourceSummary,
    sourceSummary,
  };

  return {
    slug,
    volume,
    publishDate,
    title: trend,
    trend,
    audiencePersona: Array.isArray(row.audience_tracks) ? row.audience_tracks.join(' / ') : 'all',
    cover,
    trendCards: [],
    curatorCards: [],
    surfaces: [cover],
    history: cover.history ?? '',
    whyNow: sourceSummary,
    sourceSummary,
    sourceCount: 0,
  };
}

async function signSurface(surface: AppMagazineSurface): Promise<AppMagazineSurface> {
  if (!surface.imagePath) return surface;
  return {
    ...surface,
    imageUrl: await createSignedUrl(surface.imagePath, 3600),
  };
}

export async function loadLatestPublicIssue(): Promise<AppMagazineIssue | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('magazine_issue_manifests')
    .select('*')
    .eq('qa_status', 'approved')
    .order('publish_date', { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  const row = data?.[0] as JsonObject | undefined;
  if (!row) return null;

  const assetPaths = asObject(row.asset_paths);
  const columnPayload = asObject(row.issue_payload);
  const nestedPayload = asObject(assetPaths.issuePayload);
  const rawIssue = Object.keys(columnPayload).length > 0
    ? columnPayload
    : Object.keys(nestedPayload).length > 0
      ? nestedPayload
      : fallbackIssueFromManifest(row);

  const issue = rawIssue as AppMagazineIssue;
  const cover = await signSurface(issue.cover);
  const trendCards = await Promise.all((issue.trendCards ?? []).map(signSurface));
  const curatorCards = await Promise.all((issue.curatorCards ?? []).map(signSurface));

  return {
    ...issue,
    cover,
    trendCards,
    curatorCards,
    surfaces: [cover, ...trendCards, ...curatorCards],
  };
}
