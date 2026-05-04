-- Magazine Weekly orchestration tables.
-- Owner: the-edit pipeline (service-role only).
-- The styleMeUp app reads these through a future app backend, never directly.

-- ---------------------------------------------------------------------------
-- magazine_run_steps
-- One row per (run_id, step). Persisted twice during execution: once when
-- the step starts (status=running) and once when it completes (status=complete
-- or failed). The unique constraint + upsert makes runStep() idempotent.
-- ---------------------------------------------------------------------------
create table magazine_run_steps (
  id bigserial primary key,
  run_id uuid not null,
  step text not null check (step in ('research', 'rank', 'edit', 'prompt', 'qa', 'approval', 'publish')),
  status text not null check (status in ('queued', 'running', 'complete', 'blocked', 'failed')),
  input jsonb,
  output jsonb,
  sources jsonb not null default '[]'::jsonb,
  model_provider text,
  model_name text,
  estimated_cost_usd numeric(10, 6),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (run_id, step)
);

create index magazine_run_steps_run_id_idx on magazine_run_steps (run_id);
create index magazine_run_steps_status_idx on magazine_run_steps (status);
create index magazine_run_steps_created_at_idx on magazine_run_steps (created_at desc);

alter table magazine_run_steps enable row level security;
-- No public policies. Service role bypasses RLS by design.

-- ---------------------------------------------------------------------------
-- magazine_issue_manifests
-- Published, approved Magazine issues. The app reads these (via backend) to
-- render Discover. New rows are only inserted after the publish approval gate.
-- ---------------------------------------------------------------------------
create table magazine_issue_manifests (
  id bigserial primary key,
  slug text not null unique,
  volume integer not null unique,
  publish_date timestamptz not null default now(),
  date_range text not null,
  trend text not null,
  trend_keywords text[] not null default '{}',
  era_reference text not null,
  audience_tracks text[] not null,
  cover_treatment text not null check (cover_treatment in ('scroll_sequence', 'rendered_hero')),
  asset_paths jsonb not null,
  source_summary text,
  qa_status text not null default 'approved' check (qa_status in ('approved')),
  created_at timestamptz not null default now()
);

create index magazine_issue_manifests_publish_date_idx on magazine_issue_manifests (publish_date desc);
create index magazine_issue_manifests_volume_idx on magazine_issue_manifests (volume desc);

alter table magazine_issue_manifests enable row level security;
-- No public policies. Service role only for V1.

-- ---------------------------------------------------------------------------
-- Naming convention for this database
-- ---------------------------------------------------------------------------
-- magazine_*  Magazine Weekly pipeline (the-edit owns writes)
-- app_*       styleMeUp app tables (future — closet items, saved looks, etc.)
-- ---------------------------------------------------------------------------
comment on table magazine_run_steps is 'the-edit: orchestrator step persistence. Service role only.';
comment on table magazine_issue_manifests is 'the-edit: approved Magazine issues. Readable by app backend in V2.';
