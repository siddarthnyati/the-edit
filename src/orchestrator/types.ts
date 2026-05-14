export type WorkflowStep =
  | 'research'
  | 'rank'
  | 'edit'
  | 'prompt'
  | 'qa'
  | 'approval'
  | 'imagine'
  | 'pick'
  | 'publish';

export type StepStatus =
  | 'queued'
  | 'running'
  | 'complete'
  | 'blocked'
  | 'failed'
  | 'cancelled';

export type MagazineRunMode = 'manual';

export type MagazineRunStatus =
  | 'queued'
  | 'running'
  | 'blocked'
  | 'failed'
  | 'complete'
  | 'cancelled';

export type SignalType =
  | 'editorial'
  | 'runway'
  | 'retail'
  | 'resale'
  | 'search'
  | 'social'
  | 'archive';

export type AudienceTrack = 'man' | 'woman' | 'non-binary';

export type Source = {
  title: string;
  url: string;
  publisher: string;
  observedAt: string;
  signalType: SignalType;
};

export type MagazineRunStep = {
  runId: string;
  step: WorkflowStep;
  status: StepStatus;
  input: unknown;
  output: unknown;
  sources: Source[];
  modelProvider?: string;
  modelName?: string;
  estimatedCostUsd?: number;
  error?: string;
  retryCount?: number;
  recoverable?: boolean;
  blockedReason?: string;
  rawErrorSummary?: string;
  sourceCount?: number;
  publisherCount?: number;
  createdAt: string;
  completedAt?: string;
};

export type MagazineRunRecord = {
  runId: string;
  mode: MagazineRunMode;
  status: MagazineRunStatus;
  currentStep?: WorkflowStep;
  seedTrend?: string;
  budgetUsd: number;
  totalCostUsd: number;
  startedAt?: string;
  completedAt?: string;
  publishedManifestId?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type MagazineGarmentKind =
  | 'jacket'
  | 'tee'
  | 'denim'
  | 'trouser'
  | 'skirt'
  | 'boot'
  | 'sneaker'
  | 'oxford'
  | 'cap';

export type AssetPaths = {
  coverStart: string;
  coverEnd: string;
  coverMotion: string;
  coverFrames: string;
  trendCards: string[];
  curatorCards: string[];
};

export type AppMagazineSurface = {
  slug: string;
  section: 'cover' | 'trend' | 'curator';
  headline: string;
  deck: string;
  body: string;
  kind: MagazineGarmentKind;
  eyebrow?: string;
  baseSelectionIds: string[];
  imagePath?: string;
  history?: string;
  whyNow?: string;
  sourceSummary?: string;
};

export type AppMagazineIssuePayload = {
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
  assetPaths: AssetPaths;
};

export type MagazineIssueManifest = {
  runId: string;
  slug: string;
  volume: number;
  publishDate: string;
  dateRange: string;
  register: 'Magazine';
  trend: string;
  trendKeywords: string[];
  eraReference: string;
  audienceTracks: AudienceTrack[];
  coverTreatment: 'scroll_sequence' | 'rendered_hero';
  assetPaths: AssetPaths;
  sourceSummary: string;
  qaStatus: 'approved';
  issuePayload: AppMagazineIssuePayload;
};

export type RunConfig = {
  runId: string;
  seedTrend?: string;
  budgetUsd: number;
  dateRange: string;
  audienceTracks: AudienceTrack[];
};

export type OrchestrationState = {
  config: RunConfig;
  completedSteps: WorkflowStep[];
  totalCostUsd: number;
  lastError?: string;
};
