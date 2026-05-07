# the-edit-admin · Vercel Hobby admin app

A Next.js app for picking generated image variants from a `the-edit` run.
Replaces `npm run pick` CLI with a web UI you can use from any browser.

## What's here

```
app/
  layout.tsx                      shared shell
  page.tsx                        run list (reads magazine_run_steps + variants)
  runs/[runId]/page.tsx           7-slot picker grid with click-to-pick
  api/sign-url/route.ts           server-side signed URL generator for app use
lib/
  supabase.ts                     anon + service-role clients
middleware.ts                     HTTP Basic Auth gate
```

## Local dev

```bash
cd apps/admin
npm install
cp .env.example .env.local
# edit .env.local: paste anon key, service role key, set ADMIN_PASSWORD
npm run dev
# visit http://localhost:3000 — browser will prompt for HTTP Basic Auth
```

The anon and service role keys are in your Supabase dashboard:
https://supabase.com/dashboard/project/bocvtwwmqphfnwmzdjcc/settings/api

## Deploy to Vercel (Hobby tier — free)

1. Push this repo to GitHub (or connect existing remote).
2. In Vercel dashboard: **New Project** → import the repo.
3. **Root Directory:** set to `apps/admin` (this subdirectory, not the repo root).
4. **Framework preset:** Next.js (auto-detected).
5. **Environment Variables:** add the four from `.env.example` (set `ADMIN_PASSWORD` to whatever you want).
6. Deploy.

Vercel will give you a `*.vercel.app` URL. The middleware will prompt for HTTP
Basic Auth on every request.

## Vercel Hobby tier limits we'll hit

| Resource | Limit | Likely usage |
|---|---|---|
| Bandwidth | 100 GB/month | tens of MB |
| Function invocations | 100K/month | hundreds |
| Function execution time | 100 GB-hours | minimal |
| Cron jobs | 2 per project, daily frequency | not used yet |

Free for personal use only. If `the-edit` ever monetizes, upgrade to Pro ($20/mo).

## Why HTTP Basic Auth instead of Supabase Auth?

For solo use, Basic Auth is one env var (`ADMIN_PASSWORD`). No magic-link
emails, no auth callback pages, no session management. Browser remembers
credentials per session. If we ever add a second admin user, switch to
Supabase Auth with email allowlist.

## What's NOT here yet (V2 work for the picker app)

- Run filtering / search
- Per-slot QA verdict + revision requirements display
- Inline copy editing (today the picker reads variant prompts/alt-text but doesn't let you edit)
- A "publish" button (still done from CLI: `npm run publish -- <runId>`)
- Mobile-friendly layout
- Multi-run comparison

These are valid next iterations but the V1 picker is fully functional.

## When to use this vs the CLI picker

- Web app: away from your laptop, Quick Look not available, want larger thumbnails
- CLI picker (`npm run pick`): at your laptop, fastest workflow

Both write to the same `magazine_image_variants.picked` column. They're
interchangeable.
