alter table magazine_issue_manifests
  add column if not exists run_id uuid,
  add column if not exists issue_payload jsonb not null default '{}'::jsonb;

create index if not exists magazine_issue_manifests_run_id_idx
  on magazine_issue_manifests (run_id);

comment on column magazine_issue_manifests.issue_payload is
  'App-safe published Magazine payload. Never stores prompts, costs, run steps, or unpublished variants.';
