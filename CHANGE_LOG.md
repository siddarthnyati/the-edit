# the-edit Change Log

## 2026-05-04 04:15 PM ET

- Changed:
  - Restored the `drip` Supabase project (id `bocvtwwmqphfnwmzdjcc`, us-east-2) and chose it as the shared database for both styleMeUp and the-edit.
  - Applied three migrations:
    - `20260504_init_magazine.sql` — created `magazine_run_steps` and `magazine_issue_manifests` with RLS enabled.
    - `20260504_drop_legacy_prisma.sql` — dropped seven abandoned Prisma tables (`User`, `UserProfile`, `WardrobeItem`, `OutfitRecommendation`, `WearLog`, `SavedOutfit`, `_prisma_migrations`) from a prior styleMeUp iteration. All were empty and had RLS disabled.
    - `20260504_lock_magazine_grants.sql` — revoked `SELECT` from `anon` and `authenticated` on both magazine tables so they are not discoverable through PostgREST/GraphQL.
  - Updated `.env.example` with the drip project URL.
  - Updated `NEXT_STEPS.md` with the database state and naming convention.
- Why:
  - The drip project was originally created for styleMeUp but never wired up. Reusing it avoids spinning up a third Supabase project.
  - Sharing the database between styleMeUp and the-edit is the simplest path. The naming prefix (`magazine_*` vs future `app_*`) keeps domains separated.
  - The legacy Prisma schema represented a prior product iteration that diverged from the current Expo app's data model. Adapting it would have been more work than starting fresh when styleMeUp eventually needs server-side state.
  - Locking down anon/authenticated grants matches the spec: provider keys and pipeline state never reach the client.
- Affected:
  - new directory: `supabase/migrations/`
  - new files: three migration SQL files
  - modified: `.env.example`, `NEXT_STEPS.md`
  - drip database schema
- Next:
  - copy the service role key from the drip dashboard into `.env`
  - run `npm run draft` end-to-end for the first time

## 2026-05-04 03:30 PM ET

- Changed:
  - Created the `the-edit` repo as the implementation of Track B from styleMeUp `NEXT_STEPS.md`.
  - Scaffolded the deterministic TypeScript orchestrator and six executor stubs.
  - Defined the shared types: `MagazineRunStep`, `MagazineIssueManifest`, `RunConfig`, `OrchestrationState`.
  - Implemented the Supabase persist helpers for run steps and manifests.
  - Implemented the `BRAND_PREAMBLE` and styleMeUp context loader so executors can cite `DESIGN.md` and `AGENTS.md` without re-deriving rules.
  - Wired Vercel AI `generateObject` + Zod structured outputs across all executors.
  - Built three approval gates into the orchestrator: trend winner, issue draft, publish.
  - Established documentation discipline: `NEXT_STEPS.md`, `CHANGE_LOG.md`, `MODEL_HANDOFF.md`.
- Why:
  - The styleMeUp Expo app reached its first stable checkpoint, which freed Track B work to begin.
  - Magazine orchestration cannot live inside the Expo client; it needs its own repo with server-side keys, deterministic flow, and Supabase memory.
  - The contract documents in styleMeUp were already clear enough to scaffold without further design churn.
  - We need the same documentation rhythm we use in styleMeUp so future models can hand off cleanly.
- Affected:
  - new repo: `the-edit`
  - all files under `src/`
  - `package.json`, `tsconfig.json`, `.env.example`, `CLAUDE.md`
  - `NEXT_STEPS.md`, `CHANGE_LOG.md`, `MODEL_HANDOFF.md`
- Next:
  - create the Supabase schema and migration files
  - configure `.env`
  - run the first end-to-end draft
  - wire `nextVolume()` to Supabase
  - add the `npm run publish` command
