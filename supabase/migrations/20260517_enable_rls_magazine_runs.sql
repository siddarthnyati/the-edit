-- 20260517_enable_rls_magazine_runs.sql
--
-- Security fix: public.magazine_runs had RLS disabled, so anyone with the
-- anon key (shipped in the styleMeUp client) could read/edit/delete every
-- row. It was also discoverable in the GraphQL schema. Flagged by Supabase
-- advisor lint 0013 (rls_disabled_in_public, ERROR).
--
-- The pipeline (the-edit) and the Vercel /api/issues endpoint both use the
-- service-role key, which bypasses RLS, so those paths are unaffected. The
-- client app never reads this table via the anon key — it loads the magazine
-- issue through the Vercel API, and images come from the public storage
-- bucket. So enabling RLS with no policy is a clean lockdown.

alter table public.magazine_runs enable row level security;

-- anon/authenticated should not even see this internal table in the GraphQL
-- schema. service_role retains its privileges and is unaffected.
revoke select on public.magazine_runs from anon, authenticated;
