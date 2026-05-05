# the-edit Model Handoff

Status: living context for any model continuing the work on this repo.
Last updated: 2026-05-05 (V1 image-loop plan committed; Step 0 shipped)

## V1 status — backbone complete, optimizations remaining

The full V1 loop is wired end-to-end:

```
npm run draft                  # research → rank → edit → prompt → qa
npm run imagine -- <runId>     # Gemini generates 4 × 7 = 28 variants
npm run pick    -- <runId>     # macOS Quick Look picker, 1 per slot
npm run publish -- <runId>     # writes manifest with picked asset paths
```

Plus `npm run inspect` to list/dump runs.

- ✅ **Step 0** (`f7d7aed`) — caps $2/$1.50/$1 with salvage-on-cap
- ✅ **Step 5** (`b6b2c6a`) — publish CLI
- ✅ **Step 3** (`986b13b`) — imagine executor (Gemini 2.5 Flash Image)
- ✅ **Step 4** (`72fa6ee`) — variant picker CLI
- 🔜 **Step 1** — prompt caching (~30% cost reduction)
- 🔜 **Step 2** — search archive + backfill 292 stored sources

Slot composition (locked):
1. Cover start — hero garment alone
2. Cover end — same garment, different angle
3-5. Trend cards (3) — one specific garment per card on void
6-7. Curator rotations (2) — full outfit (top + bottom + shoes) on void

Steady-state cost target with caching + archive: **~$1.20 per run**.
Today (no caching, no archive): ~$1.60 per run.
Hard cap: $2 per run. Web search alone capped at $1.

Kling motion is **dropped from V1** — manifest has empty `coverMotion` and `coverFrames`. `coverStart` + `coverEnd` provide the cover.

## How to run end-to-end (cold start)

```bash
cd /Users/siddarthnyati/the-edit

# .env must have ANTHROPIC_API_KEY, GEMINI_API_KEY, SUPABASE_URL,
# SUPABASE_SERVICE_ROLE_KEY, STYLEMEUP_REPO_PATH

npm run draft                                 # ~$0.50, ~3-5 min
npm run inspect                               # see the runId
npm run imagine -- <runId>                    # ~$1.10, ~2-3 min
npm run pick -- <runId>                       # interactive, ~5 min
npm run publish -- <runId>                    # writes manifest row
```

`MAGAZINE_AUTO_APPROVE=true` env flag skips the orchestrator's approval-gate stdin pauses for smoke tests only.

## Product Frame

`the-edit` is the Magazine Weekly orchestration pipeline for StyleMeUp. It produces one editorial Magazine issue per week and stops at human approval before publishing.

The orchestrator is deterministic TypeScript. Executors are narrow Anthropic Claude calls returning Zod-validated structured outputs. Supabase stores run state, sources, costs, and manifests.

This repo never runs in the Expo app. The app reads published manifests, never raw model output.

## Contract documents (in the styleMeUp repo)

- `DESIGN.md` — brand bible. Every line of copy and asset rule comes from here.
- `AGENTS.md` — engineering conventions.
- `MAGAZINE_AGENT_SPEC.md` — full pipeline spec, including the workflow, cost policy, approval gates, and stored run record shape.
- `AI_ORCHESTRATION.md` — orchestrator vs executor pattern, safety rules, and open decisions.

If you are picking up this repo, read those four files before changing anything in `src/`.

## Workflow Docs (in this repo)

- `NEXT_STEPS.md` — living execution plan. Always check first.
- `CHANGE_LOG.md` — dated history of changes, decisions, and follow-up implications.
- `MODEL_HANDOFF.md` — this file. Keep compact.
- Before every push or handoff:
  - confirm work is reflected in `CHANGE_LOG.md`
  - update `NEXT_STEPS.md` to match new truth
  - refresh this file if the project state meaningfully changed

## Current Build State

- Node + TypeScript strict, `exactOptionalPropertyTypes: true`.
- Vercel AI SDK (`ai` v4 + `@ai-sdk/anthropic` v1) for `generateObject` structured outputs.
- Raw `@anthropic-ai/sdk` v0.93 for server-side tools (currently web search) that the AI SDK provider does not yet expose.
- Zod for executor input/output schemas.
- Supabase JS v2 for persistence.
- `tsx` for running the orchestrator entry directly.

## Architecture

```
src/orchestrator/index.ts   deterministic sequencer, approval gates, env reading
src/orchestrator/types.ts   shared types
src/executors/research.ts   2-5 trend candidates with sources
src/executors/rank.ts       scores and picks one winner with three story angles
src/executors/edit.ts       Magazine copy draft
src/executors/prompt.ts     Nano Banana + Kling asset prompt suite
src/executors/qa.ts         Vogue test + §4 bans + cost + grounding check
src/executors/publish.ts    manifest assembly and Supabase write
src/lib/supabase.ts         createClient + persistStep + persistManifest
src/lib/context.ts          DESIGN.md and AGENTS.md loader, BRAND_PREAMBLE
```

## Major Decisions So Far

- Repo name: `the-edit`. Sits next to the styleMeUp app repo, not inside it.
- All provider keys are server-side. The Expo client never sees them.
- Three human approval gates: trend winner, issue draft, publish.
- Model routing via env vars (`MAGAZINE_RESEARCH_MODEL`, `MAGAZINE_EDITOR_MODEL`, `MAGAZINE_QA_MODEL`, `MAGAZINE_RANK_MODEL`, `MAGAZINE_PROMPT_MODEL`). Default is `claude-sonnet-4-6` for all.
- Default weekly budget: $4.00. QA executor checks total cost against this ceiling.
- One Kling motion asset per issue; all other assets are static Nano Banana.
- Approval gate UX in V1 is a stdin pause. V2 will switch to Supabase records + webhook resume.
- The publisher executor exists but is not yet wired into `npm run draft`. It will run from a separate `npm run publish -- --run-id <id>` command added next.
- Research uses Anthropic's `web_search_20260209` server-side tool with citations. Two-stage pipeline: raw SDK web search → Vercel AI `generateObject` for structuring. We will add the AI SDK web-search helper later if/when it ships.

## Current Implementation Notes

- `BRAND_PREAMBLE` in `src/lib/context.ts` is the compact system prompt prefix used by every executor. The full `DESIGN.md` is only loaded by the QA executor (where strict ban enforcement matters most).
- `extractSection()` in `src/executors/edit.ts` is a simple substring slice. If `DESIGN.md` section markers ever change, this will need a real parser.
- `nextVolume()` in `src/orchestrator/index.ts` is hard-coded to 19. Replace with a Supabase query before the second real run.
- The orchestrator's `runStep()` helper persists every step twice — once at start (status=running) and once at finish (status=complete or failed). Supabase `onConflict: 'run_id,step'` makes this idempotent.
- Costs are computed per-executor using a placeholder rate of $3/M input + $15/M output. Replace with actual model pricing when a routing decision is finalized.

## Database

`drip` Supabase project (id `bocvtwwmqphfnwmzdjcc`, region us-east-2) is shared between this repo and styleMeUp.

- `magazine_run_steps` — owned by the-edit, service role only
- `magazine_issue_manifests` — owned by the-edit, service role only
- `app_*` — reserved namespace for styleMeUp app tables (not yet created)

RLS is enabled on both magazine tables but no policies exist — service role bypasses RLS, and anon/authenticated grants have been revoked. The two INFO-level "RLS enabled, no policies" advisor notes are intentional.

Migrations live in `supabase/migrations/` as timestamped SQL files. Apply with `supabase db push` or via the MCP `apply_migration` tool.

## Verification Snapshot

- `npx tsc --noEmit` passes with zero errors.
- `npm install` succeeds with the lockfile committed.
- Three migrations applied to drip; security advisors show zero ERROR or WARN issues.
- No code has executed against Anthropic yet.

## Immediate Next Checks

- See `NEXT_STEPS.md` for the active queue.
- The first concrete blocker is the missing service role key in `.env`. Once that's populated, `npm run draft` should reach the first executor.
- The second blocker is deciding whether research starts from manual source packets or live APIs. Without real sources, the research executor will produce ungrounded candidates that the QA executor will correctly reject.
