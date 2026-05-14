# AGENTS.md

### Engineering conventions for AI agents working on StyleMeUp

This file tells Cursor, Claude Code, and any other AI agent how to behave inside this repo. **Read this and `DESIGN.md` before generating any code.** If anything in this document conflicts with `DESIGN.md`, `DESIGN.md` wins.

**Owner:** Sid · **Status:** v1 · **Last updated:** 2026-05-02

---

## 0. The two laws

1. **`DESIGN.md` is the contract.** Every line of code, copy, color, motion timing, and layout decision must be traceable back to a section in `DESIGN.md`. If you can't cite a section, ask the human before generating.
2. **The blank screen is the enemy.** No empty states. No skeleton loaders >400ms. No "loading…". Every wait is editorial — see `DESIGN.md` §11.

---

## 1. Stack

**Mobile (the real product):**
- Expo (managed workflow) + React Native + TypeScript
- Reanimated 3 for motion
- Skia for The Vanishing's particle effects
- Zustand for state, TanStack Query for data, MMKV for local storage
- Expo Router (file-based routing)

**Backend:**
- Supabase (Postgres + Auth + Storage + Edge Functions)
- All sensitive keys in env vars; never commit `.env`

**Web validation prototype (build alongside, not first):**
- Next.js 15 App Router + TypeScript + Tailwind
- Tailwind config maps directly to tokens in `tokens/colors.ts` etc.

**No alternatives without explicit human approval.** If the stack feels limiting, surface it and wait — don't swap libraries on your own.

---

## 2. Repository structure

```
project-root/
├── DESIGN.md                          ← brand bible
├── AGENTS.md                          ← this file
├── CLAUDE.md                          ← Claude Code entry point
├── README.md
├── STARTING.md
├── .cursor/rules/                     ← Cursor's auto-loaded rules
├── .claude/skills/                    ← Claude Code's auto-loaded skills
├── tokens/
│   ├── colors.ts                      ← from DESIGN.md §6
│   ├── type.ts                        ← from §7
│   ├── spacing.ts                     ← from §9
│   └── motion.ts                      ← from §11
├── components/
│   ├── ItemCard/
│   ├── OutfitComposition/
│   ├── CameraSurface/
│   ├── StarterPack/
│   ├── PersonaPick/
│   ├── FirstSignature/
│   ├── Vanishing/
│   └── primitives/                    ← Button, Eyebrow, MonumentalText, etc.
├── screens/
│   ├── Discover/                      ← Magazine register
│   ├── Closet/                        ← Sanctuary
│   ├── Looks/                         ← Sanctuary
│   ├── Capture/                       ← Sanctuary (full-screen)
│   └── Onboarding/                    ← three-state per DESIGN.md §10
├── issues/                            ← Magazine content (markdown)
├── assets/                            ← images, fonts (via expo-asset)
└── lib/
    ├── supabase.ts
    ├── auth.ts
    └── analytics.ts
```

**Do not invent new top-level directories without asking.** If you think a new one is needed, propose it and wait.

---

## 3. Tokens are sacred

Every color, font size, spacing value, and timing curve lives in `tokens/`. Components must import from `tokens/`, never hard-code values.

**Banned in component code:**
```ts
// ❌ never
backgroundColor: '#000000'
fontSize: 96
padding: 20
```

**Required:**
```ts
// ✓ always
import { colors, type, spacing } from '@/tokens';
backgroundColor: colors.void
fontSize: type.monumental.size
padding: spacing[5]
```

If a value isn't in `tokens/`, it doesn't exist. Add it to the token file first, with a comment citing the DESIGN.md section.

---

## 4. Register declaration

**Every screen file must declare its register at the top.** This is non-negotiable per DESIGN.md §1.5.

```ts
/**
 * @register Magazine
 * @design-ref DESIGN.md §1.5, §10 (Discover)
 */
```

or

```ts
/**
 * @register Sanctuary
 * @design-ref DESIGN.md §1.5, §10 (Closet)
 */
```

Mixed-register screens are not allowed. If a screen needs both, split it.

---

## 5. Code style

- **TypeScript strict mode.** No `any` without a comment explaining why.
- **Functional components only.** No class components.
- **Named exports.** Only the screen entry point gets a default export.
- **One component per file** (excluding tightly-coupled subcomponents in the same folder).
- **Imports ordered:** React → React Native → third-party → tokens → components → local.
- **No inline styles for dynamic styling.** Use `StyleSheet.create` always — it gives us the static-style optimization on RN.
- **Animations live in `useAnimatedStyle` hooks**, not inline.
- **All async functions handle errors.** No swallowed promises. No silent catches.

---

## 6. The Vogue test on every string

Before committing user-facing copy, run the Vogue test:

> *Would this sentence appear, verbatim, in a Vogue or Burberry campaign?*

If no, rewrite. If still no, delete. See `DESIGN.md` §5 for examples.

**Hard bans on copy** (DESIGN.md §4):
- ❌ Sparkle emoji ✨
- ❌ "Powered by AI"
- ❌ Sentences starting with "Let's"
- ❌ Exclamation points outside error recovery
- ❌ Adjectives "magic", "smart", "intelligent", "amazing"
- ❌ Onboarding cheerfulness ("Welcome! 🎉")
- ❌ Any emoji in product UI

When in doubt, write less. Magazine voice prefers verbless sentences. Sanctuary voice prefers lowercase.

---

## 7. Motion budget

The Vanishing (DESIGN.md §11) is the brand's signature transition. Everything else is restrained.

**Default timing:** `cubic-bezier(0.22, 1, 0.36, 1)` at 400ms (page) or 250ms (micro). Live in `tokens/motion.ts`.

**Hard rules:**
- Never use spring physics on UI chrome.
- Never use parallax on text.
- Never use 3D card flips.
- Never use bouncy modals.
- Always respect `prefers-reduced-motion` — fallback to opacity-only transitions; The Vanishing falls back to a 400ms crossfade.

If Reanimated complains about the JS thread or you need a worklet, surface it before fighting it. Often the design doesn't need that level of motion in that place.

---

## 8. Performance budget (non-negotiable)

- LCP under 2.0s on a mid-range mobile device
- Hero video loads at 720p first, swaps to 1080p after bandwidth check
- The Vanishing must hit 60fps on a 2021-era phone (iPhone 13 / Pixel 6 baseline)
- First-screen JS bundle under 200KB

When implementing anything image- or motion-heavy, measure on a real phone, not the simulator. Simulators lie about performance.

---

## 9. Accessibility (also non-negotiable)

DESIGN.md §13 sets WCAG 2.1 AA as the floor and AAA as the target.

- All interactive elements ≥ 44 × 44pt tap target
- Focus visible: 2px `--ink` (or `--paper` on Magazine) outline at 2px offset
- Alt text in editorial voice — *"oxidized burnt-amber corduroy overshirt, eight-wale brushed cotton, photographed against a pitch-black studio void"*, NOT *"image of jacket"*
- `prefers-reduced-motion` respected throughout

A11y is part of the brand. A "luxury" app that fails a11y isn't luxury — it's exclusionary.

---

## 10. Working with the Magazine pipeline

The `magazine-issue` skill (`.claude/skills/magazine-issue/SKILL.md`) generates one issue per invocation. Sid runs the prompts; the output assets are uploaded to Supabase Storage; the metadata is written to Postgres.

When generating Discover screen code that consumes Magazine issues:
- Read the latest issue from `issues/index.json` ordered by `publish_date`
- Pull asset paths from `asset_paths` in the issue metadata
- Cover treatment is `scroll_sequence` by default — frames are 24fps WebP extracted from a 10s Kling video, served as a sticky-canvas scroll-driven sequence
- Trend cards and curator cards are static images, 4:5

**Do not generate fake Magazine content for development.** Use real generated issues. If you need test data, ask Sid for it or use `vol-18-corduroy.md`.

---

## 11. Before committing

Run through this checklist mentally:

- [ ] Did I import from `tokens/` instead of hard-coding values?
- [ ] Did I declare the screen's register in the file header?
- [ ] Does every user-facing string pass the Vogue test?
- [ ] Did I respect the motion bans (no springs, no parallax, no 3D flips)?
- [ ] Are interactive elements ≥ 44×44pt?
- [ ] Did I add alt text in editorial voice?
- [ ] Did I avoid generating new dependencies without permission?

If any of those are "no," fix it before committing.

---

## 12. When you're stuck

**Don't fabricate.** If you don't know the right answer, surface it.

Examples:
- "DESIGN.md doesn't specify what happens when the user denies camera permission twice. Asking Sid before generating."
- "The current motion would require a spring physics curve, which DESIGN.md §11 bans. Suggesting an alternative or asking for an exception."
- "I can't find a token for the requested color. Adding it to `tokens/colors.ts` would expand the palette beyond DESIGN.md §6's defined set. Asking before adding."

**Pushing back is part of the job.** A YES-bot generating off-brand code is worse than no code.

---

## 13. Brand decisions still open

Per DESIGN.md §15, these are unresolved. Don't lock them in code:

1. **Brand name** — currently `StyleMeUp` (working title). The wordmark is placeholder Migra Italic.
2. **Premium tier name** — currently "Power Mode."
3. **Sustained-engagement metric** — daily streak vs weekly looks vs monthly resurrections-tried.
4. **Dark mode for Sanctuary** — V2 unless decided otherwise.

Surface these decisions when they're about to ship in code, not after.

---

*v1 · canonical · owner: Sid · last updated: 2026-05-02*
