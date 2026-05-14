# the-edit Model Handoff

Last updated: 2026-05-14 (wardrobe basics V1 shipped)

## Wardrobe basics catalog (2026-05-14)

Separate from the Magazine pipeline. Generates SSENSE-style product shots of staple wardrobe items for styleMeUp's starter pack.

- `wardrobe_basics` table (RLS, service-role only) — 20 rows after first run: 10 men, 10 women
- `wardrobe-basics` Storage bucket (public read) — `{gender}/{slug}.png`
- `src/scripts/basics.ts` — gender-split catalogs (`MEN_CATALOG`, `WOMEN_CATALOG`), hybrid Pro/Flash with auto-fallback on 503
- Dump/chosen model: every generated image stored, `is_chosen` flag flipped manually to curate
- First run: $0.78 total (Pro was overloaded, everything fell back to Flash)
- Public URL pattern: `https://bocvtwwmqphfnwmzdjcc.supabase.co/storage/v1/object/public/wardrobe-basics/{gender}/{slug}.png`

Lessons baked in:
- Per-category photography templates beat generic editorial prompts (real fix vs gimmicky output)
- Reference brand anchoring matters (Common Projects, Toteme, Mr Porter give the model a concrete visual target)
- Pro fallback to Flash with retry+backoff is mandatory — Pro overload is real



## What This Repo Is

`the-edit` is the server-side Magazine Weekly pipeline for StyleMeUp. It researches fashion return signals, ranks one editorial direction, writes a Magazine issue, emits image prompts, QA-checks the work, generates image variants, lets a human pick, and publishes an app-safe issue manifest to Supabase.

## Current State

- V1 pipeline exists in both CLI and web-admin form.
- P0 fixes are shipped: storage retry, cross-script cost cap, prompt-suite validation, and Vercel admin picker.
- The failed `edit` run was not just a logger problem. Structured output now uses repair + one bounded strict retry for `research/structure`, `rank`, `edit`, `prompt`, and `qa`.
- Admin has an ad hoc run flow: `Run issue` creates a run, `/runs/[runId]` auto-advances one persisted step at a time through `/api/runs/[runId]/advance`, and runs can cancel/retry from the page.
- Admin is deployed under the Vercel project/domain `the-edit-lime.vercel.app`.
- Supabase migrations from this session were applied through the Supabase Management API and verified against `information_schema`.
- Latest production run completed end-to-end from the Vercel admin flow and published a public issue payload.

## New App Contract

Published manifests now include an app-safe payload:

- cover
- trend cards
- curator cards
- card bodies/decks/headlines
- garment kind
- slug
- baseSelectionIds
- history / why-now / source summary
- asset paths

The public app endpoint is:

```text
GET /api/issues/latest
```

It must remain public and read-only. It uses the service role server-side, signs image URLs for one hour, and must never expose prompts, costs, run steps, service keys, or unpublished variants.

## Admin Behavior

- `/` is now an editorial dashboard, not just a runs table.
- `/` includes `Run issue`, which starts the Magazine run from the browser.
- `/runs/[runId]` shows draft copy, trend/curator cards, source/history summary, prompt text, picked images, and publish readiness.
- `/runs/[runId]` also shows run status/current step, a step timeline, cancel, retry, and auto-refresh while queued/running.
- `Publish to app` only works when QA verdict is `approve` and all seven required slots are picked:
  - `cover-start`
  - `cover-end`
  - `trend-1`
  - `trend-2`
  - `trend-3`
  - `curator-1`
  - `curator-2`

The publish action writes only a manifest. It does not call models or generate images.

The default path calls models/images and then auto-picks first variants:

```text
research -> rank -> edit -> prompt -> qa -> imagine -> pick -> publish
```

If QA is `revise` or `reject`, the run is marked `blocked` and image generation/publish do not start. If required image slots are missing, the run blocks at `pick`/`publish`.

## Key Files

- Pipeline types: `src/orchestrator/types.ts`
- Manifest assembly: `src/executors/publish.ts`
- Supabase persistence: `src/lib/supabase.ts`
- CLI publish: `src/scripts/publish.ts`
- Admin helpers: `apps/admin/lib/magazine.ts`
- Admin run engine: `apps/admin/lib/runs.ts`
- Run APIs: `apps/admin/app/api/runs/**`
- Public issue API: `apps/admin/app/api/issues/latest/route.ts`
- Admin auth middleware: `apps/admin/middleware.ts`
- Supabase migrations:
  - `supabase/migrations/20260507_issue_payload.sql`
  - `supabase/migrations/20260508_web_runner.sql`

## Verification Snapshot

Passing locally:

- `npm run typecheck`
- `cd apps/admin && npm run typecheck`
- `cd apps/admin && npm run build`
- Production run:
  - Run ID: `c83e00b0-e082-41f7-ad13-782c333b0f57`
  - Status: `complete`
  - QA: `approve`
  - Variants: 32
  - Required picks: 7/7
  - Missing required slots: 0
  - Total persisted cost: about `$2.15`
- Public API:
  - `https://the-edit-lime.vercel.app/api/issues/latest` returns `200`
  - issue slug: `vol-19-structured-shoulder`
  - title: `YOUR MOTHER'S JACKET. RECUT.`
  - signed cover image loads as `image/png`
  - no prompts, service-role keys, raw errors, run-step internals, or named-house rationale leaks are present in the response

Important follow-up from the production run:

- The old `$2.00` hard cap was too low for a real full image run. Production `MAGAZINE_HARD_CAP_USD` is now `4.00`, and the repo default was updated to match.
- QA was too adversarial as a runtime gate. It now has an explicit approval policy: block only hard ship risks, not endless subjective copy polish.
- Public publish payloads now use app-safe `whyNow/sourceSummary` text instead of raw rank/research rationale.

## Next

Wire StyleMeUp Discover to consume the published issue through `EXPO_PUBLIC_THE_EDIT_API_URL`, keep local Vol. 18 fallback, and add a visible refresh/notification when a new Magazine issue is live.
