create table if not exists public.magazine_runs (
  run_id uuid primary key,
  mode text not null default 'manual' check (mode in ('manual')),
  status text not null default 'queued' check (status in ('queued', 'running', 'blocked', 'failed', 'complete', 'cancelled')),
  current_step text check (current_step in ('research', 'rank', 'edit', 'prompt', 'qa', 'approval', 'imagine', 'pick', 'publish')),
  seed_trend text,
  budget_usd numeric(10,4) not null default 4,
  total_cost_usd numeric(10,4) not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  workflow_run_id text,
  published_manifest_id uuid,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.magazine_runs
  add column if not exists workflow_run_id text;

alter table public.magazine_run_steps
  add column if not exists retry_count integer not null default 0,
  add column if not exists recoverable boolean,
  add column if not exists blocked_reason text,
  add column if not exists raw_error_summary text,
  add column if not exists source_count integer,
  add column if not exists publisher_count integer;

alter table public.magazine_run_steps
  drop constraint if exists magazine_run_steps_status_check;

alter table public.magazine_run_steps
  add constraint magazine_run_steps_status_check
  check (status in ('queued', 'running', 'complete', 'blocked', 'failed', 'cancelled'));

alter table public.magazine_run_steps
  drop constraint if exists magazine_run_steps_step_check;

alter table public.magazine_run_steps
  add constraint magazine_run_steps_step_check
  check (step in ('research', 'rank', 'edit', 'prompt', 'qa', 'approval', 'imagine', 'pick', 'publish'));

create index if not exists magazine_runs_status_created_idx
  on public.magazine_runs (status, created_at desc);

create index if not exists magazine_runs_current_step_idx
  on public.magazine_runs (current_step);
