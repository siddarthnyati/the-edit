-- 20260620_classify_events.sql
--
-- Traceability for the garment classifier (evals/README.md §4 in styleMeUp):
-- one row per /api/classify call — enough to reconstruct volume, lane mix
-- (accept/ask/reject), ambiguity creep, latency, model version, and spend
-- over time, without storing any user image. No PII: no photo, no user id
-- (pre-auth product), just the decision telemetry.
--
-- RLS enabled with no policies = deny-all for anon/authenticated; the
-- server-side service role (which bypasses RLS) is the only writer/reader.

create table if not exists classify_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  model text not null,
  is_garment boolean not null,
  kind text not null,
  slot text not null,
  ambiguous boolean not null,
  lane text not null check (lane in ('accept', 'ask', 'reject')),
  latency_ms integer not null,
  cost_usd numeric(10, 6) not null default 0
);

alter table classify_events enable row level security;

create index if not exists classify_events_at_idx on classify_events (at desc);
