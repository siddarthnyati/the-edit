-- Wardrobe basics: separate catalogs per gender, one row per generated
-- variant. We keep every generation (we paid for it) and flip is_chosen
-- on the ones we want the styleMeUp app to actually use.

create table wardrobe_basics (
  id bigserial primary key,
  gender text not null check (gender in ('men', 'women', 'unisex')),
  category text not null,
  -- silhouette_tag groups items by fit/cut for filtering in the app
  silhouette_tag text,
  slug text not null,
  name text not null,
  storage_path text not null,
  generation_model text not null,
  prompt text not null,
  cost_usd numeric(10, 6) not null default 0,
  variant_index integer not null default 0,
  is_chosen boolean not null default false,
  created_at timestamptz not null default now(),
  chosen_at timestamptz,
  unique (gender, slug, variant_index)
);

create index wardrobe_basics_gender_idx on wardrobe_basics (gender);
create index wardrobe_basics_chosen_idx on wardrobe_basics (gender, is_chosen) where is_chosen = true;
create index wardrobe_basics_category_idx on wardrobe_basics (gender, category);

alter table wardrobe_basics enable row level security;
revoke select on wardrobe_basics from anon, authenticated;

comment on table wardrobe_basics is 'the-edit: gender-split wardrobe basics catalog. Dumped (all rows) vs chosen (is_chosen=true).';

-- Storage bucket for the actual PNG files. Public read since these are
-- catalog imagery the styleMeUp app shows freely (not gated content).
insert into storage.buckets (id, name, public)
values ('wardrobe-basics', 'wardrobe-basics', true)
on conflict (id) do nothing;
