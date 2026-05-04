# the-edit Next Steps

Last updated: 2026-05-04 03:30 PM ET

## Current status

`the-edit` is the Magazine Weekly orchestration pipeline for StyleMeUp. The repo was bootstrapped from the `MAGAZINE_AGENT_SPEC.md` and `AI_ORCHESTRATION.md` contracts in the styleMeUp repo. The full executor scaffold compiles clean and is pushed to `main`. Nothing has run end-to-end yet — Supabase tables, env keys, and the first real research step still need to be wired.

## Completed since last update

- Initialized the repo with TypeScript strict mode and `exactOptionalPropertyTypes`.
- Wrote the deterministic orchestrator entrypoint with three approval gates (trend winner, issue draft, publish).
- Wrote stubs for all six executors using Vercel AI `generateObject` + Zod structured outputs:
  - research, rank, edit, prompt, qa, publish
- Modeled the Supabase persist layer for run steps and issue manifests.
- Wrote the `BRAND_PREAMBLE` and the styleMeUp context loader.
- Established documentation discipline matching the styleMeUp repo:
  - `NEXT_STEPS.md` is the living execution plan
  - `CHANGE_LOG.md` is the dated history
  - `MODEL_HANDOFF.md` is the compact handoff document

## Current focus

Get one weekly run end-to-end in draft mode. No production publishing yet.

## Next steps

1. Configure `.env` locally with:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (copy from drip project dashboard)
   - `SUPABASE_URL` is already set in `.env.example`
   - `STYLEMEUP_REPO_PATH` pointing at the local clone.
2. Run `npm run draft` for the first time and capture what breaks.
3. Replace the hard-coded `nextVolume()` (currently 19) with a Supabase query that reads `max(volume)` from `magazine_issue_manifests`.
4. Implement a `npm run publish -- --run-id <id>` command that:
   - Loads the approved draft and asset paths.
   - Calls `runPublish()` to write the manifest.
5. Decide whether asset upload (Nano Banana / Kling outputs) lives in this repo or stays manual.
6. Decide whether the styleMeUp app reads issues from Supabase directly or via a separate StyleMeUp API.

## Database state

The `drip` Supabase project (id `bocvtwwmqphfnwmzdjcc`, us-east-2) is shared between this repo and styleMeUp. Naming convention:

- `magazine_*` — owned by the-edit (writes via service role only)
- `app_*` — reserved for styleMeUp app tables (not yet created)

Current tables: `magazine_run_steps`, `magazine_issue_manifests`. Both RLS-enabled with no policies, anon/authenticated grants revoked. Service role only.

Legacy Prisma tables from a prior styleMeUp iteration (`User`, `WardrobeItem`, etc.) were dropped on 2026-05-04 — they were empty and incompatible with the current Expo app architecture.

## Track-level alignment with styleMeUp

This repo is the implementation of Track B from the styleMeUp `NEXT_STEPS.md`. Track A continues independently in the styleMeUp repo. The two repos do not share code yet — they share contract documents.

## Blockers and open decisions

- Supabase tables do not exist yet.
- The research executor is currently model-only and will hallucinate without real source packets. We need to decide whether V1 starts from manual source packets or live APIs (this question is also open in `AI_ORCHESTRATION.md`).
- The publisher executor is written but not yet invoked from the orchestrator. The `npm run publish` command needs to be added.
- Volume number persistence is not yet wired — Supabase query needed.
- No model evals exist yet. Per `AI_ORCHESTRATION.md`, evals are required before this becomes production.
- Asset upload workflow is out of scope for V1 but needs a decision before V2.
