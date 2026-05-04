export type WorkflowStep =
  | 'research'
  | 'rank'
  | 'edit'
  | 'prompt'
  | 'qa'
  | 'approval'
  | 'publish';

export type StepStatus =
  | 'queued'
  | 'running'
  | 'complete'
  | 'blocked'
  | 'failed';

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
  createdAt: string;
  completedAt?: string;
};

export type MagazineIssueManifest = {
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
  assetPaths: {
    coverStart: string;
    coverEnd: string;
    coverMotion: string;
    coverFrames: string;
    trendCards: string[];
    curatorCards: string[];
  };
  sourceSummary: string;
  qaStatus: 'approved';
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
