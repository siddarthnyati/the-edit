# the-edit Next Steps

Last updated: 2026-05-10

## Current Truth

The P0 reliability work is now in code and the first full web-native production run completed:

- Storage upload retry with backoff: shipped in `src/executors/imagine.ts`.
- Cross-script cost cap: shipped via prior-cost loading in `src/lib/cost.ts`.
- Prompt validation for §8 composition bans and tool-name leaks: shipped in `src/executors/prompt.ts`.
- Vercel admin picker: shipped in `apps/admin`.

The previous failed run (`b2cc555e-d905-4651-a40c-c117cb99380a`) was caused by `edit` returning output that did not satisfy the Zod schema. That is now handled with schema repair plus one bounded strict-JSON retry for `research/structure`, `rank`, `edit`, `prompt`, and `qa`.

Production run `c83e00b0-e082-41f7-ad13-782c333b0f57` completed end-to-end on Vercel:

- QA verdict: `approve`
- Image variants generated: 32
- Required picks: 7/7
- Missing required slots: 0
- Published issue: `vol-19-structured-shoulder`
- Public endpoint: `GET https://the-edit-lime.vercel.app/api/issues/latest`

The active V1 gap is no longer terminal orchestration. The admin app now has a deterministic ad hoc run surface: click `Run issue`, watch the run page, and let the page call `/api/runs/[runId]/advance` until the server proceeds through research, rank, edit, prompt, QA, image generation, auto-pick, and publish unless QA/assets block it.

## Shipped In This Push

- Tried Vercel Workflow, but production runs stayed `pending`. Replaced the active path with deterministic step advancement through `/api/runs/[runId]/advance`.
- Added run control APIs:
  - `POST /api/runs`
  - `GET /api/runs/[runId]`
  - `POST /api/runs/[runId]/cancel`
  - `POST /api/runs/[runId]/retry`
- Added `magazine_runs` schema and richer step metadata in `supabase/migrations/20260508_web_runner.sql`.
- Added admin `Run issue` button, run status, step timeline, cancel, retry, and auto-refresh/advance on active runs.
- Added schema repair and bounded retry around structured AI outputs.
- Improved web search behavior: prompt cap now matches the actual 3-search tool cap, weak research gets exactly one last-chance targeted search, and the run blocks before rank/edit if source quality is still too low.
- Published manifest now carries an app-safe issue payload: cover, trend cards, curator cards, bodies, kind, slugs, base selections, source/history/why-now summary, and asset paths.
- Added migration `supabase/migrations/20260507_issue_payload.sql` for `run_id` and `issue_payload`.
- Kept a fallback storage path by embedding `issuePayload` inside `asset_paths` if the live Supabase table has not yet received the new columns.
- Added public `GET /api/issues/latest` in the Vercel admin app. It is excluded from Basic Auth and returns only approved published issue content plus short-lived signed image URLs.
- Reworked admin home into an editorial dashboard: latest live issue, latest run readiness, QA state, picked slots, cost, and publish status.
- Reworked run detail into an editorial preview: issue copy, history, why-now, trend cards, curator cards, prompts, picked images, and missing publish actions.
- Added server action to publish QA-approved, fully picked runs to the app without rerunning model/image steps.

## Active Priority

1. Wire StyleMeUp Discover to `GET /api/issues/latest` and refresh the feed after a new issue is published.
2. Add a StyleMeUp notification/badge for “new Magazine issue live.”
3. Run one fresh admin `Run issue` click after the cap/QA hardening changes to confirm no manual artifact patching is needed.
4. Tighten the admin UI around blocked QA: show “hard blockers” separately from editorial suggestions so the operator knows when to retry versus edit.

## Product Direction

Runs are intentionally ad hoc. The operator clicks `Run issue` whenever the magazine needs a refresh: once this week, twice next week, or ten minutes before a StyleMeUp push. Do not add cron until there is a real editorial cadence that needs automation.

After publish, StyleMeUp should refresh the Discover feed from `GET /api/issues/latest` and show a user-facing notification/badge that a new Magazine issue is live.

Cost note: the first real full image run landed at about `$2.15`, so the production hard cap is now `$4.00`. The old `$2.00` cap was too tight once cover Pro images plus seven 4-variant slots were included.

## Still Deferred

- Kling/video cover motion.
- Multi-issue app archive.
- Personalized Magazine per user.
- Affiliate/shopping links.
- Human manual override for image picks remains available; auto-pick chooses the first variant per required slot so unattended runs can complete.
