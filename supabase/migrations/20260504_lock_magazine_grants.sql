-- Magazine tables are service-role only in V1.
-- Revoke SELECT from anon and authenticated roles so the tables are not
-- discoverable via PostgREST or the GraphQL schema. The service role bypasses
-- these grants by design.

revoke select on public.magazine_run_steps from anon, authenticated;
revoke select on public.magazine_issue_manifests from anon, authenticated;

-- When the styleMeUp app backend (V2) needs to read approved issues, grant
-- SELECT to a dedicated role (e.g. `app_reader`) — never broadly to anon.
