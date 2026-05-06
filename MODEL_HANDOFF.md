# the-edit Model Handoff

Last updated: 2026-05-05 (V1 complete, Gemini cap added, smoke-test passed)

## What this repo is

Magazine Weekly orchestration pipeline for StyleMeUp. Researches → ranks
→ writes → generates 28 image variants → human picks → publishes manifest
to Supabase. Anthropic for editorial + QA, Gemini Nano Banana for images.

## V1 status: COMPLETE and verified

Real run from 2026-05-04 produced approved draft with QA `revise` correctly
catching: Vogue-test failures, ungrounded Lacoste/Prada SS26 claims,
"Nano Banana" / "Kling" tool name leaks, WCAG alt-text issues.

Gemini smoke test 2026-05-05: 808KB image in 4.5s, on-brand black turtleneck on void.

## Run sequence (production)

```bash
cd /Users/siddarthnyati/the-edit
npm run draft                  # ~$0.50, 3-5 min, pauses at gates
npm run inspect                # find runId
npm run imagine -- <runId>     # ~$1.10, 2-3 min, generates 28 images
npm run pick    -- <runId>     # macOS Quick Look, type 1-4 per slot
npm run publish -- <runId>     # writes magazine_issue_manifests row
```

For unattended smoke tests: `MAGAZINE_AUTO_APPROVE=true npm run draft`.

## Costs (verified on 2026-05-04 successful run)

| Stage | Real cost | Notes |
|---|---|---|
| research/search | $0.247 | 47 sources, 5 queries (now capped at 3) |
| research/structure | $0.027 | 25s wait avoids rate limit |
| rank | $0.025 | |
| edit | $0.031 | DESIGN.md §4 excerpt |
| prompt | $0.040 | Asset prompt suite |
| qa | $0.109 | Full DESIGN.md (will drop to $0.02 with cache) |
| **draft total** | **$0.479** | |
| imagine (28 images) | $1.092 | After Step 3 ships images |
| **issue total** | **~$1.57** | First run, no cache hits |
| **steady state** | **~$1.20** | After cache + archive hits |

Hard caps: total $2, web search $1, imagine $3.

## Database (Supabase: drip / `bocvtwwmqphfnwmzdjcc`)

```
magazine_run_steps           one row per (runId, step)
magazine_issue_manifests     approved/published issues
magazine_image_variants      4 variants per slot per run
magazine_search_archive      cross-run source memory (47 rows after backfill)
```

Storage bucket `magazine-assets`: `{runId}/{slot}/{idx}.png`.

All service-role only.

## Stack

- Node 20+ TypeScript strict, `exactOptionalPropertyTypes: true`
- Vercel AI SDK v4 + `@ai-sdk/anthropic` v1 for `generateObject`
- Raw `@anthropic-ai/sdk` v0.93 for web search (server-side tool)
- `@google/genai` v1.52 for Gemini image generation
- `@supabase/supabase-js` v2 for persistence + storage
- `zod` for executor schemas
- `tsx` runtime, `dotenv` with override semantics

## Key architectural decisions

1. **Two-stage research** — Anthropic web search returns prose + citations, then `generateObject` structures into `TrendCandidate[]`. Stage 2 has a 25s wait to avoid the 30K input-tokens-per-minute rate limit.
2. **Salvage-on-cap** — when `MAGAZINE_WEB_SEARCH_CAP_USD` is exceeded, research stops issuing new queries but uses sources already gathered.
3. **Archive write before stage 2** — sources persisted before stage 2's wait, so a stage-2 failure no longer loses paid-for searches.
4. **Cache prefix in QA** — full DESIGN.md (~21K tokens) wrapped in `providerOptions.anthropic.cacheControl: { type: 'ephemeral' }`. From run 2 onward, reads at 0.1× rate.
5. **Approval gates pause stdin** — `MAGAZINE_AUTO_APPROVE=true` flag for smoke tests only.
6. **Image generation outsourced to Gemini** — Anthropic doesn't generate images. Pipeline emits prompts; the imagine executor calls Gemini Nano Banana (`gemini-2.5-flash-image`).
7. **Picker is CLI for V1** — `npm run pick` opens macOS Quick Look. V2 candidate: Next.js admin app on Vercel.
8. **App reads manifests** — styleMeUp Expo app should read from `magazine_issue_manifests` via Supabase. Not yet wired (V2 work in styleMeUp repo).

## Open V2 work

See `NEXT_STEPS.md`.

## Common gotchas

- Parent shell's empty `ANTHROPIC_API_KEY` overrides `.env` unless `dotenv` is loaded with `override: true`. Handled in `src/lib/env.ts`.
- Gemini model name is `gemini-2.5-flash-image` (no `-preview` suffix). Old code had `-preview` and 404'd.
- Running outside the-edit dir breaks imports — always `cd /Users/siddarthnyati/the-edit` first.
- Web search results count against input tokens (search results land in context). Constrain `max_uses` aggressively.
- Sonnet 4.6 cache minimum is 2048 tokens. Editor's prefix is ~600 → won't cache. QA's is ~21K → caches well.
