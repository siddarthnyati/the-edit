# the-edit Next Steps

Last updated: 2026-05-05 (V1 image-loop plan committed)

## V1 status — backbone complete, optimizations remaining

Steps 0, 5, 3, 4 are shipped. The full V1 loop runs end-to-end:

```
npm run draft                  # research → rank → edit → prompt → qa
npm run imagine -- <runId>     # Gemini generates 4 × 7 = 28 variants
npm run pick    -- <runId>     # macOS Quick Look picker, 1 winner per slot
npm run publish -- <runId>     # writes manifest with picked asset paths
```

Plus utilities: `npm run inspect` (list / dump runs), all costs persisted to Supabase.

### ✓ Step 0 — Tighten cost caps (shipped `f7d7aed`)

- `MAGAZINE_HARD_CAP_USD=2`, `MAGAZINE_BUDGET_USD=1.50`, `MAGAZINE_WEB_SEARCH_CAP_USD=1`
- Salvage-on-cap: research stops issuing new queries when web cap hit, but proceeds with sources already gathered
- `web_search_20260209` `max_uses: 3`
- Per-query billing fixed (was per-source)

### ✓ Step 5 — Wire `npm run publish` (shipped `b6b2c6a`)

- `src/scripts/publish.ts` reads research/edit/prompt outputs from a completed run, confirms QA approved, resolves next volume, calls `runPublish()` to write the manifest

### ✓ Step 3 — Image executor (shipped `986b13b`)

- New table `magazine_image_variants` + `magazine-assets` Supabase Storage bucket
- `src/executors/imagine.ts` generates 4 variants per slot via Gemini 2.5 Flash Image, uploads to Storage, indexes in DB
- `npm run imagine -- <runId>`
- Slot composition (locked): cover-start, cover-end, trend-1..3, curator-1..2

### ✓ Step 4 — CLI variant picker (shipped `72fa6ee`)

- `npm run pick -- <runId>` downloads variants, opens in `qlmanage -p`, you press 1-4 (or s to skip / q to quit)
- Pick clears any prior pick on the same slot — fully re-runnable
- Publish script now reads picked variants instead of placeholder paths and refuses to publish until all 7 slots have a winner

### ✓ Step 1 — Prompt caching (shipped `d3da646`)

- QA: `providerOptions.anthropic.cacheControl: { type: 'ephemeral' }` on full DESIGN.md content part. Cost drops $0.11 → $0.02 from run 2 onward.
- Research/search: `cache_control` on system array. ~30% reduction on repeat calls.
- Editor skipped (~600 token cached content, below Sonnet's 2048 cache minimum).

### ✓ Step 2 — Source archive (shipped this commit)

- `magazine_search_archive` table created with GIN index on `trend_keywords`.
- `src/lib/archive.ts`: `archiveSources()` upsert + `findFreshSources()` query.
- Research executor checks archive first; skips web search entirely when ≥15 fresh sources match.
- Sources persisted *before* stage 2 — stage 2 failures no longer lose paid-for searches.
- `npm run backfill-archive` recovered 47 sources from prior successful run. (The 292-source run failed at stage 2 before the new archive write logic existed, so those are not recoverable.)

## V2 candidates (unprioritized)

- **In-app variant picker.** Replace `npm run pick` CLI with an admin-gated screen in the styleMeUp app.
- **Bake the asset-tool-name ban into the prompt executor's system prompt.** QA had to catch "Nano Banana" / "Kling" leaks on the first real run. Should be a hard rule for the prompt executor.
- **Kling motion.** Once base costs are stable and Kling API is purchased.
- **Scheduled runs.** Cron / GitHub Actions to run the pipeline weekly without manual kickoff.
- **Issue archive in the app.** styleMeUp Discover should show prior issues, not just the latest.

## Cost projection across the plan

| Phase | Research | QA | Other | Images | Web fees | Total |
|---|---|---|---|---|---|---|
| Today (post-Step 0, no images) | $0.20 | $0.11 | $0.10 | — | $0.03 | $0.44 |
| After Step 3 (images live) | $0.20 | $0.11 | $0.10 | $1.09 | $0.03 | $1.53 |
| After Step 1 (caching) | $0.10 | $0.02 | $0.04 | $1.09 | $0.03 | $1.28 |
| After Step 2 (archive, week 2+) | $0.05 | $0.02 | $0.04 | $1.09 | $0.00 | $1.20 |

All inside the $2 hard cap.

## Open decisions

- Does the variant picker live as a CLI (Step 4) or in the styleMeUp app's admin surface? CLI ships first; app surface is V2.
- When does Kling come back? Tied to (a) reliable cost reduction and (b) buying the API.
- Should the search archive deduplicate by URL alone, or also by content-hash to catch republished articles?

## Track-level alignment with styleMeUp

This repo is the implementation of Track B from the styleMeUp `NEXT_STEPS.md`. Track A (the Expo app) continues independently. The two repos share contract documents (`DESIGN.md`, `AGENTS.md`, `MAGAZINE_AGENT_SPEC.md`, `AI_ORCHESTRATION.md`) but no code.

## Out of date below this line — kept for context until subsumed

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
2. Run `npm run draft` for the first time and capture what breaks. The research executor now actually hits the web — first run will produce real grounded candidates.
3. Replace the hard-coded `nextVolume()` (currently 19) with a Supabase query that reads `max(volume)` from `magazine_issue_manifests`.
4. Implement a `npm run publish -- --run-id <id>` command that:
   - Loads the approved draft and asset paths.
   - Calls `runPublish()` to write the manifest.
5. Tune the source publisher classifier in `research.ts` once we see what real `web_search_20260209` results look like — currently a hand-rolled allowlist of fashion publishers, may need broadening.
6. Decide whether asset upload (Nano Banana / Kling outputs) lives in this repo or stays manual.
7. Decide whether the styleMeUp app reads issues from Supabase directly or via a separate StyleMeUp API.

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
