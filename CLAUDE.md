# CLAUDE.md — the-edit

Magazine Weekly orchestration pipeline for StyleMeUp. The deterministic
TypeScript orchestrator runs six executors against Anthropic + Gemini +
Supabase (`drip` project, `bocvtwwmqphfnwmzdjcc`).

## Read these first (in order)

1. `MODEL_HANDOFF.md` — current state, costs, V1 status
2. `NEXT_STEPS.md` — concrete queue
3. `../styleMeUp/DESIGN.md` §4 (bans) and §11 (motion)
4. `../styleMeUp/MAGAZINE_AGENT_SPEC.md` — pipeline spec
5. `CHANGE_LOG.md` only if you need history

## V1 pipeline (all wired)

```
npm run draft                 # research → rank → edit → prompt → qa
npm run imagine -- <runId>    # Gemini gemini-2.5-flash-image, 4 × 7 = 28 variants
npm run pick    -- <runId>    # macOS Quick Look picker
npm run publish -- <runId>    # writes magazine_issue_manifests row
npm run inspect               # list / dump runs
npm run backfill-archive      # one-time recovery from prior runs
```

## Hard rules

- Orchestrator is code, not an LLM. Never let a model decide flow, spend, or publish.
- Three approval gates (trend, draft, publish) require human input unless
  `MAGAZINE_AUTO_APPROVE=true` (smoke tests only).
- Cost caps enforced by `src/lib/cost.ts`:
  - `MAGAZINE_HARD_CAP_USD=2` total per run
  - `MAGAZINE_WEB_SEARCH_CAP_USD=1` with salvage-on-cap
  - `MAGAZINE_IMAGINE_CAP_USD=3` per run
- All keys server-side. Expo client never sees them.
- `web_search_20260209` capped at `max_uses: 3`.

## Architecture

```
src/orchestrator/index.ts   sequencer + approval gates
src/orchestrator/types.ts   shared types (RunStep, Manifest, RunConfig)

src/executors/research.ts   web search → archive write-back → structure
src/executors/rank.ts       score + pick winner + 3 story angles
src/executors/edit.ts       Magazine copy draft
src/executors/prompt.ts     Nano Banana + (deferred) Kling prompt suite
src/executors/qa.ts         Vogue test, §4 bans, source grounding
src/executors/imagine.ts    Gemini variant generation, 4 per slot
src/executors/publish.ts    manifest assembly, Supabase write

src/scripts/*.ts            CLI entries (draft via orchestrator/index.ts)
src/lib/env.ts              dotenv with override + drop inherited vars
src/lib/cost.ts             three-axis cost tracking with caps
src/lib/supabase.ts         persist helpers
src/lib/archive.ts          search archive query + upsert
src/lib/context.ts          DESIGN.md / AGENTS.md loader, BRAND_PREAMBLE
```

## Database (Supabase project: drip / `bocvtwwmqphfnwmzdjcc`)

| Table | Owned by | Purpose |
|---|---|---|
| `magazine_run_steps` | the-edit | Every executor step persisted (input, output, sources, cost) |
| `magazine_issue_manifests` | the-edit | Approved + published issues. App reads via backend |
| `magazine_image_variants` | the-edit | 4-per-slot Gemini outputs. `picked=true` after `npm run pick` |
| `magazine_search_archive` | the-edit | Cross-run source memory. Skip web search when fresh |

Storage bucket: `magazine-assets` — variants at `{runId}/{slot}/{idx}.png`.

All RLS-enabled, service-role only.

## Slot schema

7 slots × 4 variants per issue:
- `cover-start` — hero garment, alone, void background
- `cover-end` — same garment, different angle/state
- `trend-1`, `trend-2`, `trend-3` — single garment per card on void
- `curator-1`, `curator-2` — full styled outfits (top + bottom + shoes)

Kling motion deferred to V2.

## Costs (steady-state per run)

- Week 1 fresh trend: ~$1.60
- Week 2+ archive hit: ~$1.20
- Hard cap: $2 total, $1 web-search, $3 imagine

## Skipped on purpose

- Editor caching (~600 token prefix below 2048-token cache minimum)
- Inline image generation in Magazine pipeline (we use Gemini, not Anthropic)
- Auto-pick (always human)
