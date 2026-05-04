# CLAUDE.md — the-edit

This repo is the Magazine Weekly orchestration pipeline for StyleMeUp.

## Contract documents

The source of truth lives in the styleMeUp repo:

- `DESIGN.md` — brand bible. All copy and asset rules come from here.
- `AGENTS.md` — engineering conventions.
- `MAGAZINE_AGENT_SPEC.md` — this pipeline's full spec.
- `AI_ORCHESTRATION.md` — orchestrator/executor pattern and safety rules.

Do not re-derive rules that are already written there. Load and cite them.

## Architecture

```
src/orchestrator/index.ts   — deterministic sequencer, owns all gates
src/orchestrator/types.ts   — shared types (MagazineRunStep, MagazineIssueManifest)
src/executors/research.ts   — trend research
src/executors/rank.ts       — trend scoring and winner selection
src/executors/edit.ts       — Magazine copy draft
src/executors/prompt.ts     — Nano Banana + Kling asset prompt suite
src/executors/qa.ts         — brand, source, and cost QA
src/executors/publish.ts    — manifest assembly and Supabase write
src/lib/supabase.ts         — Supabase client and persist helpers
src/lib/context.ts          — DESIGN.md / AGENTS.md loader
```

## Rules

- The orchestrator is TypeScript code, not an LLM. Never let a model decide flow, spend, or publish.
- Executors return structured outputs via Zod schemas. Validate before passing to the next step.
- Every step is persisted to Supabase before and after execution.
- Three approval gates: trend winner, issue draft, publish. All three require Sid.
- No autonomous publish in V1.
- No client-side provider keys. No service-role key in the app.
- All editorial copy must pass the Vogue test and DESIGN.md §4 bans.

## Running

```bash
cp .env.example .env   # fill in keys
npm install
npm run draft          # runs research → rank → edit → prompt → qa
                       # pauses at approval gates
```

## Open decisions

See `AI_ORCHESTRATION.md` § Open Decisions for the live list.
`nextVolume()` in `src/orchestrator/index.ts` is hard-coded to 19 — wire to Supabase after first publish.
