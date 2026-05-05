# the-edit Change Log

## 2026-05-05 (V1 backbone complete: Steps 0 + 5 + 3 + 4 shipped)

- Changed:
  - **Step 5 (`b6b2c6a`)** — `npm run publish -- <runId>` reads research/edit/prompt outputs from a completed run, confirms QA approved, resolves next volume number from `magazine_issue_manifests`, calls `runPublish()` to write the manifest. Refuses to publish if QA verdict was anything but `approve`.
  - **Step 3 (`986b13b`)** — `npm run imagine -- <runId>` calls Gemini 2.5 Flash Image (`gemini-2.5-flash-image-preview`) to generate 4 variants per slot for all 7 slots. Variants land in the `magazine-assets` Supabase Storage bucket and are indexed in a new `magazine_image_variants` table. New env var `GEMINI_API_KEY`. New env var `MAGAZINE_VARIANTS_PER_SLOT` (default 4).
  - **Step 4 (`72fa6ee`)** — `npm run pick -- <runId>` downloads each slot's variants from Storage, opens them in macOS Quick Look (`qlmanage -p`), prompts for 1-4 selection. Each pick clears any prior pick on the same slot. Re-runnable. Publish script updated to read picked rows from `magazine_image_variants` instead of placeholder paths — refuses to publish if any of the 7 slots is unpicked.
  - Migration `20260505_image_variants.sql` applied to drip Supabase. Created `magazine_image_variants` table (RLS on, anon/auth grants revoked) and `magazine-assets` Storage bucket (private).
  - Locked Kling motion as deferred to V2 — V1 manifests have empty `coverMotion` and `coverFrames`. `coverStart` + `coverEnd` provide the cover treatment.
- Why:
  - The full V1 loop (draft → imagine → pick → publish) is the minimum bar for a "working pipeline." Stopping at draft made the system an outline, not a product.
  - Variant picker as CLI is fine for V1 — you're the only operator. App-side admin UI is V2 work.
- Cost picture per run with images shipped today:
  - draft: ~$0.50 (research + rank + edit + prompt + QA)
  - imagine: ~$1.09 (28 × $0.039)
  - **total ~$1.60 per issue** — well inside the $2 hard cap.
- Affected:
  - `src/executors/imagine.ts` (new)
  - `src/scripts/publish.ts` (new)
  - `src/scripts/imagine.ts` (new)
  - `src/scripts/pick.ts` (new)
  - `supabase/migrations/20260505_image_variants.sql` (new)
  - `package.json` (3 new scripts: imagine, pick, publish)
  - `.env.example` (GEMINI_API_KEY, MAGAZINE_VARIANTS_PER_SLOT)
- Next:
  - Step 1 — prompt caching for ~30% cost reduction
  - Step 2 — search archive + 292-source backfill
  - Once both ship, steady-state runs land at ~$1.20

## 2026-05-05 (Step 0: cost cap tightening + V1 plan locked)

- Changed:
  - Lowered hard cost cap from $25 → **$2** per run.
  - Lowered soft budget from $4 → **$1.50** (warn-but-continue threshold).
  - Added a separate **`MAGAZINE_WEB_SEARCH_CAP_USD=1`** that tracks web search query fees on its own axis, with a salvage path: when the cap is exceeded the research executor stops issuing further queries but proceeds with whatever sources it has already gathered. Run only aborts when the cap is hit AND zero sources were collected.
  - Lowered `web_search_20260209` `max_uses` from 5 → **3**.
  - Replaced the incorrect "$0.01 per source" web-search cost estimate with the correct "$0.01 per query" (counted via `server_tool_use` blocks in the response).
  - Locked V1 plan: 0 → 5 (publish) → 3 (image executor) → 4 (CLI picker) → 1 (caching) → 2 (search archive). V1 includes images now — emitting prompts without rendering them was not a real V1.
  - Updated `NEXT_STEPS.md` with the full ordered plan, slot composition table, and cost projections.
- Why:
  - The previous $25 cap was fire suppression, not a budget. After auditing the $10 console bill, web search-driven token bloat was the dominant cost driver, not the per-query fee. With `max_uses: 3` and a hard $2 total cap, runaway costs are now structurally prevented.
  - Salvage-on-cap is the right behavior: dollars already spent should produce results, not an exit code.
  - V1 with manual image generation isn't really V1. Adding the image executor + variant picker is now part of the V1 backbone, not V2.
- Cost projection after each remaining step is tracked in `NEXT_STEPS.md`. Steady state with images + caching + archive: ~$1.20 per run.
- Affected:
  - `src/lib/cost.ts` (web search axis, salvage-friendly accessors)
  - `src/executors/research.ts` (counts queries correctly, salvages on cap, max_uses=3)
  - `.env.example` (new caps)
  - `NEXT_STEPS.md` (plan rewrite)
- Next:
  - Step 5 — `npm run publish -- <runId>` to write the manifest after approval
  - Step 3 — `src/executors/imagine.ts` calling Gemini 2.5 Flash Image, 4 variants × 7 slots
  - Step 4 — `npm run pick -- <runId>` CLI for variant selection
  - Step 1 — prompt caching on DESIGN.md and BRAND_PREAMBLE blocks
  - Step 2 — search archive table + 292-source backfill

## 2026-05-04 09:30 PM ET

- Changed:
  - First end-to-end pipeline run completed against real Supabase, real Anthropic API, and real web search.
  - Switched the research search call to `messages.stream()` — non-streaming was timing out behind the SDK's idle window when web search ran multiple sub-requests.
  - Constrained the search call: `max_uses: 5` on the web search tool, prompt asks for exactly 3 trends and ≤ 2000 words, smaller `DESIGN.md` excerpt in the system prompt.
  - Inserted a 25-second wait between stage 1 (search) and stage 2 (structuring) to avoid stacking against the 30K input tokens / minute rate limit.
  - Trimmed the narrative passed to stage 2 to 8000 characters.
  - Added `MAGAZINE_AUTO_APPROVE=true` env flag to skip stdin pauses on approval gates — for smoke tests only, never default behavior.
  - Verified via Supabase: every step from a successful run is persisted with `status: 'complete'` and the run ID can be reconstructed end-to-end.
- Why:
  - The first unconstrained search ran 200K+ input tokens behind the scenes (search results count against the same window) and the structuring stage hit the rate limit before Anthropic's per-minute window reset.
  - Streaming is the right default for any tool-use call. Non-streaming on tool use is a recipe for timeouts.
  - Caps + delays let the pipeline stay inside a free-tier rate limit. Any caller with a higher tier can remove the wait.
  - QA verdict on the first real run was `revise` — it correctly caught Vogue-test failures, ungrounded sourcing, banned tool names in asset prompts, and a WCAG alt-text issue. The architecture works.
- Cost on the successful run: $0.48 total — research $0.27, rank $0.02, edit $0.03, prompt $0.04, QA $0.11. Well under the $4 budget.
- Affected:
  - `src/executors/research.ts` (streaming, `max_uses`, prompt tightening, stage delay, narrative trim)
  - `src/orchestrator/index.ts` (auto-approve gate)
- Next:
  - persist `estimated_cost_usd` into Supabase (currently `null` in run rows even though the value is logged)
  - decide how the orchestrator should handle a `revise` verdict: auto-iterate on the failed sections vs. hand off to a human
  - bake the asset-tool-name ban into the prompt executor's system prompt so QA doesn't have to catch it every time

## 2026-05-04 04:45 PM ET

- Changed:
  - Rewrote the research executor to actually hit the web instead of relying on model knowledge alone.
  - Added `@anthropic-ai/sdk` as a direct dependency. The Vercel AI SDK provider (`@ai-sdk/anthropic` v1.2.12) does not expose Anthropic server-side tools yet, so the research stage uses the raw SDK.
  - Two-stage research pipeline:
    - Stage 1: raw Anthropic `messages.create` with the `web_search_20260209` tool. Returns grounded narrative text plus `web_search_tool_result` blocks.
    - Stage 2: Vercel AI `generateObject` with a Zod schema converts the narrative into 2-5 typed `TrendCandidate` records.
  - Source extraction reads URLs and titles directly from `web_search_tool_result` blocks. A small classifier maps publisher hostnames to the `signalType` enum (`editorial`, `runway`, `retail`, `resale`, `search`, etc.).
- Why:
  - Without web search the research executor would hallucinate, the QA executor would correctly reject it, and the pipeline would never produce an approvable issue. Web search is the smallest unblock.
  - Two stages keep concerns clean: search returns prose with citations, structuring turns prose into typed records the orchestrator can validate.
  - The newest server-side web search version (`web_search_20260209`) supports dynamic filtering, which is the right choice for trend research where most search results are noise.
- Affected:
  - `src/executors/research.ts` (significant rewrite)
  - `package.json` (+ `@anthropic-ai/sdk`)
  - `package-lock.json`
- Next:
  - try the first end-to-end `npm run draft` and observe real source quality
  - tune the publisher → signalType classifier based on what real searches actually surface

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
