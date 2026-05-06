-- Search archive — every source the research executor has ever seen.
-- The executor checks this before issuing a web search; if enough fresh
-- sources match the seed trend, skips web search entirely. Otherwise the
-- new search results merge into this table for future runs.

create table magazine_search_archive (
  url text primary key,
  title text not null,
  publisher text not null,
  signal_type text not null check (
    signal_type in ('editorial', 'runway', 'retail', 'resale', 'search', 'social', 'archive')
  ),
  trend_keywords text[] not null default '{}',
  raw_snippet text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  source_run_ids uuid[] not null default '{}'
);

create index magazine_search_archive_publisher_idx on magazine_search_archive (publisher);
create index magazine_search_archive_signal_type_idx on magazine_search_archive (signal_type);
create index magazine_search_archive_last_seen_idx on magazine_search_archive (last_seen_at desc);
create index magazine_search_archive_keywords_gin on magazine_search_archive using gin (trend_keywords);

alter table magazine_search_archive enable row level security;
revoke select on magazine_search_archive from anon, authenticated;

comment on table magazine_search_archive is 'the-edit: durable cross-run source memory. Service role only.';
