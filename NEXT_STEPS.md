# the-edit Next Steps

Last updated: 2026-05-05

## V1 status: ✅ COMPLETE

```
draft → imagine → pick → publish
```

All shipped. Gemini integration verified (smoke test 2026-05-05). All cost
caps enforced ($2 hard / $1 web / $3 imagine).

See `MODEL_HANDOFF.md` for run sequence + verified costs.

---

## V2 — concrete steps in priority order

### 1. Wire the styleMeUp Expo app to read manifests from Supabase

**Why first:** the-edit produces manifests but the app still reads
`lib/magazineIssue.ts` (hard-coded Vol. 18 corduroy). Until this is wired,
nothing the pipeline produces actually appears in the product.

Where: `styleMeUp` repo (not the-edit).

Concrete tasks:
- [ ] Install `@supabase/supabase-js` in styleMeUp Expo app
- [ ] Add `lib/supabase.ts` with anon-key client (read-only via signed URLs)
- [ ] Replace `lib/magazineIssue.ts` static export with a query: `select * from magazine_issue_manifests order by volume desc limit 1`
- [ ] Use `supabase.storage.from('magazine-assets').createSignedUrl(path, 3600)` for asset URLs
- [ ] Update `screens/Discover/Discover.tsx` to consume manifest shape
- [ ] Test cold-load + offline fallback to last cached manifest

Effort: 3-4 hours. No new infra needed — drip Supabase already has the data.

### 2. Bake asset-tool-name ban into the prompt executor

**Why:** QA caught "Nano Banana" / "Kling" leaks on the first real run.
Wasted a $0.11 QA round catching what should be a hard rule.

Where: `the-edit/src/executors/prompt.ts`.

Concrete:
- [ ] Add to system prompt: "Never name the asset generation tool (Gemini, Nano Banana, Imagen, Kling, etc.) in any prompt or alt text. Describe the desired image directly."
- [ ] Add a Zod refine on `AssetPromptSuiteSchema` that rejects strings containing those tokens
- [ ] Re-test with `npm run draft`

Effort: 30 min.

### 3. Build the in-app variant picker (Vercel admin app)

**Why:** CLI picker requires being at the laptop with macOS Quick Look.
A web admin app means picking from anywhere, with thumbnails alongside
the prompt + alt text for context.

Where: new directory `the-edit/apps/admin/` (Next.js, deploy to Vercel).

Concrete:
- [ ] `apps/admin/` Next.js scaffold
- [ ] Supabase Auth with email allowlist (just sidd.nyati96@gmail.com)
- [ ] `/runs` — list runs from `magazine_run_steps` grouped by run_id
- [ ] `/runs/[runId]/pick` — 7 slots × 4 thumbnails, click to set `picked=true`
- [ ] `/api/sign-url` — server-side signed URL generation for the magazine-assets bucket
- [ ] Deploy to Vercel under custom domain or `the-edit-admin.vercel.app`

Effort: 6-8 hours. ~250-400 lines of code.

### 4. Scheduled weekly run

**Why:** the whole point is one issue per week without manual kickoff.

Where: GitHub Actions or Vercel Cron in the-edit repo.

Concrete:
- [ ] `.github/workflows/weekly-draft.yml` — cron `0 14 * * 0` (Sunday 2pm ET)
- [ ] Job runs `npm run draft` with `MAGAZINE_AUTO_APPROVE=false` — gates surface as GitHub issue comments awaiting approval
- [ ] On approval (label or comment), trigger `npm run imagine` then notify Sid
- [ ] Sid runs `npm run pick` locally, then `npm run publish` from CLI

Effort: 2-3 hours.

### 5. Kling motion (deferred from V1)

**Why:** Magazine issue benefits from a 5s motion cover. Currently using
two static frames as a scroll sequence.

Concrete:
- [ ] Purchase Kling API access
- [ ] Add `MAGAZINE_KLING_CAP_USD` env (default $1)
- [ ] Add `coverMotion` slot to `imagine.ts` calling Kling instead of Gemini
- [ ] Update prompt executor to emit motion direction without naming Kling
- [ ] Update manifest `coverTreatment` to `scroll_sequence`

Effort: 3-4 hours after API access is in hand.

---

## Things to monitor

- **First QA run after caching change** — verify `cache-read:21000` appears in the qa cost log line. If not, cache isn't firing.
- **First archive hit run** — once 7+ days have passed since first archive write, run `npm run draft` with a seed trend that matches existing archive keywords. Should see `[research/archive] HIT` and skip web search.
- **Cumulative drip Supabase usage** — drip is on free tier. If we run weekly, growth is small but watch storage (each run = 28 × ~800KB ≈ 22 MB, plus row growth).

---

## Things explicitly NOT in V2 scope

- Multi-issue archive view in the app (V3)
- Automated Kling video review (V3 — humans review motion)
- Multi-language support (out of brand for now)
- Personalized issues per user (out of scope per `AI_ORCHESTRATION.md`)
