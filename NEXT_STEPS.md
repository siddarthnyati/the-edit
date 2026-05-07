# the-edit Next Steps

Last updated: 2026-05-06 (post end-to-end V1 acid test)

## V1 status: ✅ COMPLETE — verified end-to-end on run `12274d5e`

```
draft → imagine → pick → publish
```

Real run produced 40 generated images for $2.06 total. QA correctly
flagged flat-lay violations that visually confirmed in `curator-1` output.
See `MODEL_HANDOFF.md` for cost breakdown.

---

## V2 — fixes from the acid test (priority order)

### P0 — Constrain curator card count (prevent 2× cost runs)

**Evidence:** Run 12274d5e emitted 6 curator card prompts instead of 2.
Imagine generated 11 slots × 4 = 44 images for $1.56 instead of 7 × 4 =
28 for $1.09. The schema doesn't enforce a max.

Where: `src/executors/prompt.ts`

```ts
curatorCardPrompts: z.array(...).min(1).max(2)
```

Effort: 5 min.

### P0 — Bake §8 (no flat-lays) into prompt executor system prompt

**Evidence:** QA flagged flat-lays in 4 prompts on run `12274d5e`. The
generated `curator-1` image is visually a flat-lay. Prompt executor needs
hard rules in its system prompt + a Zod refine that rejects strings
containing "flat-lay", "flat lay", "from above", "top-down", "laid flat".

Where: `src/executors/prompt.ts` system + schema refine.

Effort: 20 min.

### P0 — Storage upload retry with backoff

**Evidence:** Cover-end slot lost all 4 variants to Supabase Storage
timeout on run 12274d5e while every other slot succeeded. Generation cost
($0.16) wasted with no retry.

Where: `src/executors/imagine.ts` — wrap `uploadVariant` in retry helper
with 3 attempts × exponential backoff (1s, 4s, 16s).

Effort: 30 min.

### P0 — Cross-script cost cap (currently per-script only)

**Evidence:** Total run hit $2.06, over the $2 hard cap, because cap state
is in-memory per Node process. Draft script's $0.50 didn't propagate to
imagine script's tracker. Each individually was under cap.

Where: `src/lib/cost.ts` — read prior run's cumulative cost from Supabase
on startup when `MAGAZINE_RUN_ID` is set, seed the in-memory totals.

Effort: 30 min.

---

## V2 — feature work in priority order

### 1. Wire the styleMeUp Expo app to read manifests from Supabase

**Why first:** the-edit produces manifests but the app still reads
`lib/magazineIssue.ts` (hard-coded Vol. 18 corduroy). Until this is wired,
nothing the pipeline produces actually appears in the product.

Where: `styleMeUp` repo (not the-edit).

Concrete tasks:

- Install `@supabase/supabase-js` in styleMeUp Expo app
- Add `lib/supabase.ts` with anon-key client (read-only via signed URLs)
- Replace `lib/magazineIssue.ts` static export with a query: `select * from magazine_issue_manifests order by volume desc limit 1`
- Use `supabase.storage.from('magazine-assets').createSignedUrl(path, 3600)` for asset URLs
- Update `screens/Discover/Discover.tsx` to consume manifest shape
- Test cold-load + offline fallback to last cached manifest

Effort: 3-4 hours. No new infra needed — drip Supabase already has the data.

### 2. Bake asset-tool-name ban into the prompt executor

**Why:** QA caught "Nano Banana" / "Kling" leaks on the first real run.
Wasted a $0.11 QA round catching what should be a hard rule.

Where: `the-edit/src/executors/prompt.ts`.

Concrete:

- Add to system prompt: "Never name the asset generation tool (Gemini, Nano Banana, Imagen, Kling, etc.) in any prompt or alt text. Describe the desired image directly."
- Add a Zod refine on `AssetPromptSuiteSchema` that rejects strings containing those tokens
- Re-test with `npm run draft`

Effort: 30 min.

### 3. Build the in-app variant picker (Vercel admin app)

**Why:** CLI picker requires being at the laptop with macOS Quick Look.
A web admin app means picking from anywhere, with thumbnails alongside
the prompt + alt text for context.

Where: new directory `the-edit/apps/admin/` (Next.js, deploy to Vercel).

Concrete:

- `apps/admin/` Next.js scaffold
- Supabase Auth with email allowlist (just [sidd.nyati96@gmail.com](mailto:sidd.nyati96@gmail.com))
- `/runs` — list runs from `magazine_run_steps` grouped by run_id
- `/runs/[runId]/pick` — 7 slots × 4 thumbnails, click to set `picked=true`
- `/api/sign-url` — server-side signed URL generation for the magazine-assets bucket
- Deploy to Vercel under custom domain or `the-edit-admin.vercel.app`

Effort: 6-8 hours. ~250-400 lines of code.

### 4. Scheduled weekly run

**Why:** the whole point is one issue per week without manual kickoff.

Where: GitHub Actions or Vercel Cron in the-edit repo.

Concrete:

- `.github/workflows/weekly-draft.yml` — cron `0 14 * * 0` (Sunday 2pm ET)
- Job runs `npm run draft` with `MAGAZINE_AUTO_APPROVE=false` — gates surface as GitHub issue comments awaiting approval
- On approval (label or comment), trigger `npm run imagine` then notify Sid
- Sid runs `npm run pick` locally, then `npm run publish` from CLI

Effort: 2-3 hours.

### 5. Kling motion (deferred from V1)

**Why:** Magazine issue benefits from a 5s motion cover. Currently using
two static frames as a scroll sequence.

Concrete:

- Purchase Kling API access
- Add `MAGAZINE_KLING_CAP_USD` env (default $1)
- Add `coverMotion` slot to `imagine.ts` calling Kling instead of Gemini
- Update prompt executor to emit motion direction without naming Kling
- Update manifest `coverTreatment` to `scroll_sequence`

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

---

## V10 / future product ideas (captured from acid test feedback)

### Revenue + sourcing layer

- **Google Lens / shopping integration** for paid users. When a user sees a piece in a Magazine issue, they can tap to find it on retail sites (Zara, SSENSE, etc.).
- **Affiliate referral revenue.** Each shopping link is a tagged affiliate URL. Click attribution tracked in Supabase. Initial partners: ShopStyle Collective, Skimlinks, or direct retailer affiliate programs (LTK, Rewardstyle).
- **Source-grounded recommendations.** Move from generic editorial to "this exact garment is currently at X retailer for $Y."

### Discovery classification by occasion

- Add an `occasion` axis to Discover: `office casual`, `going out`, `weekend`, `formal`, `gym`, `travel`.
- The Magazine pipeline emits issues across these axes simultaneously instead of one trend per week.
- User taps an occasion in the styleMeUp app → sees curated looks within that context, drawn from their owned items + a few recommendations.

### Body-type personalization (StitchFix-for-AI)

- Onboarding adds 3-5 quiet questions: rough proportions, comfort with skin reveal, color tones that work, occasions covered.
- Recommendations score-rank against the user's profile.
- Parameters worth thinking about: shoulder vs hip ratio, height proxy, color season, formality preference, climate.
- Accuracy measurement: tap-through rate, save rate, "wear" log feedback. Feed back into the recommender.

### Magazine app design overhaul

- Re-evaluate the Discover surface: how do trends cards feel on a 6.1" screen at arm's length?
- Cover motion vs static — the deferred Kling work would matter most here.
- Reading flow: the current 1-cover-then-3-cards pattern is fine for V1. Test whether a single-scroll long-form issue feels better.
- Closet integration density — show a "from your wardrobe" matchstick under each trend card more prominently.

These are explicitly product strategy work, not pipeline work. They go in styleMeUp's `NEXT_STEPS.md` once we move there.