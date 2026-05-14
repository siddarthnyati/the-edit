# DESIGN.md

### StyleMeUp · canonical · v3

**Single source of truth for visual, interaction, emotional, and tonal decisions.** Drop this file into the repo root. Tell your AI agent to use it before every task. If a generated screen contradicts this document, the document wins. No exceptions.

**Owner:** Sid · **Status:** canonical (supersedes v1, v2 drafts) · **Last updated:** 2026-04-30

---

## 0. The Mandate

**We give people the power to feel like the version of themselves they already are — but better dressed.**

Not a closet app. Not a styling tool. **A confidence engine.**

The product exists because there is a moment, every morning, when a person stands in front of a mirror and decides whether they are someone today or not. We compress the gap between *what they own* and *who they want to be seen as.* That is the entire job.

Every screen, every word, every animation must answer one question: **does this make the user feel more like themselves, or less?** If the answer is less — even by a degree — the screen does not ship.

We are luxury, but the luxury is the **feeling**, not the price tag. The user pays us so they never feel under-dressed again. They open us daily. They never regret the subscription. That is what *sustained* means here — not recycled cotton, **sustained engagement, sustained confidence.**

---

## 1. What This Product Is And Isn't

### What we are

- A **confidence engine** disguised as a wardrobe app.
- An **archivist of taste** that resurrects dead trends before the herd catches them. Corduroy 2012 → corduroy 2026 at $60 a pair. We don't follow trends; we declare them.
- A **camera-first product**. The phone lens is the primary input device.
- **Personal and safe.** The closet is a private dressing room. Nobody is judging. Nobody is watching.
- A product the user **opens daily and never regrets paying for.**

### What we are not

- Not another wardrobe-organizer app you'd never open twice.
- Not the AI-blurbed, sparkle-emoji, "let's find your style!" garbage flooding the App Store.
- Not Pinterest with extra steps. Not a social network. Not a sustainability tracker.
- Not generic. Not safe-in-the-boring-sense. Not something the user would be embarrassed to have on their home screen.
- Not free. The product has a cost; the cost is part of the promise.

### The defining product belief

**The blank screen is the enemy.** A user who has uploaded nothing should still feel a fully-realized, *cinematic* experience the moment they open the app — resurrected trends, curated influencer rotations, a starter-pack assumption that we know they probably own a white tee, a black tee, dark denim. The app earns its first impression *before the user does any work*. We are never empty. We are never asking them to fill us up.

---

## 1.5 The Two Registers

This is the most important architectural decision in the document. Read it twice.

The product lives in **two emotional registers**. They share a brand and a token system, but they speak with different voices, use different surfaces, and serve different feelings.

### The MAGAZINE

*The user steps into the magazine to be seduced.*

- **Where:** Discover tab, trend features, influencer rotations, look reveals, the cold-start cover, the first-signature moment.
- **Surface:** True black canvas (`--void`). Full-bleed cinematic imagery. Monumental UPPERCASE display type. Signal Red used sparingly and powerfully.
- **Reference register:** Ferrari, Lamborghini, Bugatti, Burberry campaign films, Prada FW lookbooks.
- **Feeling:** Indulgence. Aspiration. *"Look at this."* Heavy. Confident. The user is a guest at an exhibition.
- **Voice:** Declarative. Monumental. Few words, all of them final.
  - *"LAST SEEN: 2013. RETURNING."*
  - *"FOR THURSDAY."*
  - *"YOURS."*
  - *"YOUR FIRST SIGNATURE."*

### The SANCTUARY

*The user steps into the sanctuary to belong.*

- **Where:** Closet, fittings, capture flow, save-confirmations, settings, the user's private looks, all of onboarding except the first-signature reveal.
- **Surface:** Paper white (`--paper`). Quiet imagery, generous whitespace, lowercase italic display type, mixed-case body. Power Gold used as the "saved" accent.
- **Reference register:** Bulgari jewelry box, Cartier interior, Aesop store, the inside of a tailor's atelier.
- **Feeling:** Privacy. Trust. *"This is yours."* Hushed. Calm. The user is alone with their own taste.
- **Voice:** Intimate. Lowercase. Slightly warmer.
  - *"saved."*
  - *"your closet."*
  - *"you probably own these."*
  - *"reading the piece..."*

### Architectural rule

**No screen mixes registers.** Discover is Magazine, top to bottom. Closet is Sanctuary, top to bottom. Transitions between them are designed moments — the user *enters* and *leaves* each register, and they should feel the shift.

The single exception is the camera capture flow + first-signature reveal: capture lives in Sanctuary (intimate by nature), but the *first-signature moment* at the end of onboarding pulls into Magazine for that one screen — that's where Moment Yellow earns its single use — then returns the user to Sanctuary for the closet view. This is the heartbeat of the product.

---

## 2. Who We're Designing For

### Persona 1 — The Fatigued Millennial
- Disposable income. Zero decision energy.
- Wants to look pulled-together without becoming a fashion person.
- Pain: standing in front of a full closet thinking *"I have nothing to wear."*
- We win by removing decisions, not adding them.

### Persona 2 — The Professional
- Doesn't care what it costs. Cares that it works.
- Wants service, speed, and signal — not features.
- Pain: every other app wastes their time with onboarding theatre.
- We win by respecting their time and their taste.

### Persona 3 — The Classy
- Watches influencers. Reads editorial. Wants the *next* thing, not the current thing.
- Will adopt a resurrected trend before the algorithm catches it.
- Pain: most "AI stylist" products feel like a Pinterest fork.
- We win by editorial credibility — sourcing, framing, point of view.

### Across all three

**They will pay. They expect quality in proportion to what they pay. Cheap-feeling UI is an immediate trust collapse.**

---

## 3. North Star References

### The Wardrobe Half — what we steal from fashion luxury

| Reference | What we take |
|---|---|
| **Gucci** | Saturated editorial photography, confident negative space |
| **Prada** | Architectural restraint, sans-serif headline confidence |
| **Bulgari / Cartier** | Hushed Sanctuary surfaces, gold-leaf restraint, jewel-box pacing |
| **Zara** | Camera-zoom on hover, aggressive crops, tight layout grids |
| **Burberry** | Cinematic autoplay video, scroll-driven motion |
| **FWRD** | Editorial product cards with tasteful captions |

### The Power Half — what we steal from luxury automotive

| Reference | What we take |
|---|---|
| **Ferrari** | Chiaroscuro black-white editorial, single Signal Red, extreme sparseness |
| **Lamborghini** | True black cathedral, gold accent, monumental uppercase typography |
| **Bugatti** | Cinema-black canvas, monochrome austerity, monumental display type |
| **BMW M** | Pure black canvas, full-bleed photography, surgical accent stripes |
| **Tesla** | Radical subtraction, full-viewport imagery, near-zero UI chrome |

**The thread:** TRUE black + TRUE white. ONE accent that earns its place. MONUMENTAL display type. EXTREME sparseness. CINEMATIC photography. EDITORIAL pacing. **Power that doesn't shout.**

### Anti-references — these are bans

- ❌ Any other "AI stylist" or wardrobe app currently on the App Store
- ❌ Pinterest's masonry grid
- ❌ Instagram's chrome
- ❌ Any onboarding flow with a sparkle emoji or a confetti animation
- ❌ "Powered by AI" badges anywhere on any surface
- ❌ Material Design's elevation system
- ❌ The default Bootstrap, Tailwind, or shadcn aesthetic

---

## 4. The Anti-Pattern Library

These are bans. Not preferences. Bans.

### Visual bans
- ❌ Purple-to-blue gradients (the AI default)
- ❌ Glassmorphism, frosted blurs as primary surface treatment
- ❌ Rounded corners ≥ 8px on cards, buttons, or any structural element
- ❌ Drop shadows that simulate Material elevation
- ❌ Saturated accent colors that aren't earned (no neon, no electric anything)
- ❌ Stock photography of any kind, ever
- ❌ AI-generated human faces in UI chrome
- ❌ Decorative illustration of any kind — no spot illustrations, no mascots, no editorial-cartoon style
- ❌ Gradients on text
- ❌ Any "pattern" backgrounds (dots, lines, noise textures)

### Copy bans
- ❌ Sparkle emoji (✨) anywhere — global, total, permanent
- ❌ "Powered by AI" stamps, badges, or footer mentions
- ❌ Sentences that begin with "Let's" ("Let's find your style!")
- ❌ Exclamation points outside of error recovery
- ❌ "Magic," "smart," "intelligent," "amazing" as adjectives
- ❌ Onboarding cheerfulness ("Welcome! 🎉")
- ❌ Emoji of any kind in product UI

### Layout bans
- ❌ Dashboard layouts (KPI cards in a 4-up grid)
- ❌ Pinterest-style masonry as primary content layout
- ❌ Side rails on mobile
- ❌ Bottom tab bars with more than 4 items
- ❌ Modal dialogs for anything that isn't a destructive confirmation
- ❌ Two registers on the same screen (see §1.5)

### Interaction bans
- ❌ Bouncy spring animations on UI chrome
- ❌ Haptic feedback on every tap (only on consequential moments)
- ❌ Skeleton loaders visible >400ms — load editorial content instead
- ❌ "Are you sure?" confirmations on benign actions
- ❌ Onboarding tooltips that obscure the UI

---

## 5. Brand Voice

### Posture

Declarative. Editorial. Dry. Confident-without-trying.

### Voice splits across the two registers

#### Magazine voice
- ALL CAPS for monumental moments. UPPER-and-lowercase for everything else.
- Sentences are short, often verbless. Final. No hedging.
- Examples:
  - *"LAST SEEN: 2013. RETURNING."*
  - *"FOR THURSDAY."*
  - *"THIS WEEK."*
  - *"YOUR FIRST SIGNATURE."*
  - *"Three pieces, one silhouette. Below."*

#### Sanctuary voice
- lowercase for headers (deliberate, hushed).
- Short, gentle, declarative.
- Slightly warmer than Magazine, never cute.
- Examples:
  - *"saved."*
  - *"your closet."*
  - *"you probably own these."*
  - *"reading the piece..."*
  - *"that didn't go through. try again."*

### Voice spec, side-by-side

| Moment | Magazine voice | Sanctuary voice | Anti (never) |
|---|---|---|---|
| Save confirmation | *"YOURS."* | *"saved."* | *"Got it! Added to your closet 🎉"* |
| Empty state | *"NOTHING YET. THIS WEEK'S RETURN, BELOW."* | *"nothing here yet. start with what you own."* | *"Looks like your closet is empty! Let's add some items 👗"* |
| Camera prompt | *"FRAME THE PIECE"* (eyebrow only) | *"reading the piece..."* (loading) | *"Snap a pic! 📸"* |
| Error | *"DIDN'T GO THROUGH."* | *"that didn't go through. try again."* | *"Oops! Something went wrong."* |
| Premium upsell | *"UNLOCKED. POWER MODE."* | *"unlocked. you'll see more now."* | *"Upgrade now to get amazing AI features ✨"* |

### The Vogue test

Before any copy ships, ask: *would this sentence appear, verbatim, in a Vogue or Burberry campaign?* If no, rewrite. If still no, delete.

---

## 5.5 Headline Patterns (for the Magazine pipeline)

The editor executor in `the-edit` pipeline produces trend headlines every week. Functional headlines like *"The Bootcut Jean: Y2K Denim Rewired for 2026"* fail the Vogue test — they read as a Wikipedia subheading, not editorial. Use these patterns instead.

### The four headline shapes

| Pattern | Psychology hook | Example transformation |
|---|---|---|
| **The Reversal** | Reframing — flip the era from "old" to "now" | "1990s V-neck jumper" → ***"YOUR DAD'S SWEATER. YOUR MOVE."*** |
| **The Possessive** | Endowment effect — "your" creates ownership before purchase | "Bootcut jeans return" → ***"WHAT YOUR MOTHER WORE. WORN BETTER."*** |
| **The Date Stamp** | Curiosity gap — "last seen" opens a loop | "Bohemian layering" → ***"LAST SEEN: 2004. REWRITTEN."*** |
| **The Single Verb** | Cognitive ease — verb-only is unmistakable | "V-neck heritage knitwear" → ***"RETURNING."*** |

### Headline construction rules

1. **Maximum 6 words.** If you need more, you don't have a headline yet.
2. **Period at the end.** Never a comma, never a question mark, never an exclamation.
3. **No colons in trend headlines.** "Bootcut: Y2K Returns" reads as a textbook entry.
4. **One specific noun per headline.** "The slip dress" beats "minimalist eveningwear."
5. **Year reference allowed only once per issue.** "1996" or "Y2K" can anchor one card; the rest must work without dates.

### Before / after — recent run output rewritten

| Functional draft (rejected) | Magazine register (correct) |
|---|---|
| *"The Bootcut Jean: Y2K Denim Rewired for 2026"* | *"WHAT YOUR MOTHER WORE. CUT BETTER."* |
| *"Bohemian Layering: The Chloé Decade Returns Through Its Own House"* | *"SIENNA'S CLOSET. STILL OPEN."* |
| *"The V-Neck Jumper: 1990s Heritage Knitwear at the Center of the Wardrobe"* | *"V FOR THE WARDROBE."* |
| *"Six Houses Confirmed This Across SS26"* | *"SIX HOUSES. ONE SILHOUETTE."* |
| *"Three Eras Fashion Is Pulling Back Into the Present"* | *"THREE ERAS. ONE SEASON."* |

### Psychology principles, named

These come from the Growth.Design 106 audit. Apply them deliberately:

- **Curiosity gap** — "LAST SEEN: 2004" is unfinished. The user must read on to close it.
- **Endowment effect** — "YOUR DAD'S SWEATER" treats the trend as already-owned.
- **Picture superiority** — pair the headline with a single garment image; never with a collage.
- **Cognitive ease** — verbless or single-verb sentences scan in <1 second.
- **Peak-end rule** — the cover headline is the issue's peak. Spend the editorial care here.
- **Reframing** — old → returning, dated → considered, basic → architectural.
- **Personalization** — "YOUR" is the most powerful word in the lexicon. Use sparingly.

### What to never do

- Never explain the trend in the headline. The deck does that.
- Never use the year as the headline ("2026 IS BOOTCUT") — too telegraphed.
- Never name a specific designer in the headline ("Chloé Returns") — saves them for the body.
- Never use a question mark. The Magazine doesn't ask.
- Never use slang the year before it peaks ("BOOTCUTCORE") — slang dates the issue immediately.

### The editor executor enforcement

`the-edit/src/executors/edit.ts` should validate that:

1. `cover.headline` is ≤ 6 words and ends in `.` (not `?`, `!`, or `,`)
2. `cover.headline` does not contain a colon `:`
3. Each `trendCards[*].headline` matches one of the four patterns above
4. No headline mentions a designer or brand by name
5. At most one headline per issue contains a year

Add these as Zod refines on the `IssueDraftSchema` in the edit executor.

---

## 6. Color System

### Core palette

| Token | Hex | Usage |
|---|---|---|
| `--void` | `#000000` | **Magazine canvas.** Discover, trend features, look reveals, first-signature moment. True black. |
| `--paper` | `#FFFFFF` | **Sanctuary canvas.** Closet, capture, settings, all onboarding except first-signature. True white. |
| `--ink` | `#0A0A0A` | Body text on `--paper`. Primary action fills (Sanctuary). Just-off-true-black. |
| `--bone` | `#FAFAFA` | Sanctuary elevated surface (cards, sheets, tile fills). |
| `--shadow` | `#050505` | Magazine elevated surface (modals, sheets on void). |

### Signal palette — three accents, three jobs, no overlap

| Token | Hex | Job | Where |
|---|---|---|---|
| `--signal` | `#E10600` | **The "yes."** Primary action, save-confirmation flash, starter-pack check, add-to-look. | Both registers, sparingly. Never decoration. |
| `--power` | `#B8954A` | **The "premium."** Paid tier, generation moments, the brand mark, camera shutter. | Sanctuary primarily; Magazine as a quiet underline. |
| `--moment` | `#FFD60A` | **The "you arrived."** Used **once per user journey** — at the first-signature reveal. Reappears only on milestones (10th look, 100th, anniversary). | Magazine. Single-use ceremonial. |

### Neutral ramp

| Token | Hex | Use |
|---|---|---|
| `--smoke-100` | `#F2F2F2` | Sanctuary dividers, disabled fills |
| `--smoke-200` | `#D6D6D6` | Sanctuary borders, secondary chrome |
| `--smoke-300` | `#8C8C8C` | Caption text, metadata (both registers) |
| `--smoke-400` | `#3D3D3D` | Magazine deemphasized text, Sanctuary tertiary |
| `--smoke-500` | `#1A1A1A` | Magazine secondary surface |

### Color rules

1. **One accent per screen.** Signal OR Power OR Moment. Never two together.
2. **Accents indicate state, never decorate.** Signal = the action. Power = the pay-wall. Moment = the milestone.
3. **Magazine is `--void`. Sanctuary is `--paper`.** Pick the register, then the surface follows.
4. **Never tint the canvas.** No blue-tinted black, no warm-tinted white. Pure.
5. **WCAG 2.1 AA minimum, target AAA.** Body text on `--paper` uses `--ink` (≥7:1 contrast). Body text on `--void` uses `--paper` (21:1).
6. **Signal Red is `#E10600`.** Not Ferrari Red `#FF2800`. The slightly-darker `#E10600` reads "Cartier-box red" rather than "alert red."
7. **Moment Yellow appears once per user journey.** Budget it. Earn it.

---

## 7. Typography

### Type stack

| Role | Typeface (preferred) | Free fallback | Notes |
|---|---|---|---|
| **Display (Magazine)** | **Migra** by Pangram Pangram | **Fraunces** (Google Fonts) | High-contrast modern serif with stunning italic. Used UPPERCASE for Magazine eyebrows; italic for editorial captions and the Sanctuary lowercase headers. |
| **Display (Sanctuary)** | **Söhne Breit** by Klim | **Inter Display** (Google Fonts) | Confident wide grotesque. Used at headline scale. |
| **Body** | **Söhne** by Klim | **Inter** (Google Fonts) | Workhorse. Both registers. |
| **Mono** | **Söhne Mono** | **JetBrains Mono** | Technical metadata only — sizes, color codes, EXIF on capture. |

**Licensing:** Migra ~$200 (Pangram Pangram), Söhne ~$650 (Klim Type) for desktop + web. **MVP fallback: Fraunces + Inter (free, Google Fonts).** Upgrade post-launch. Free pair gets us 85% there.

### Type scale (mobile-first, 4pt grid)

| Token | Size / Line | Weight | Use |
|---|---|---|---|
| `--monumental` | 96 / 96 | Migra Italic 400 OR Söhne Breit 600 | Magazine cover headlines. ONE per screen, max. |
| `--display-xl` | 56 / 60 | 400 / 600 | Section heroes |
| `--display-lg` | 40 / 44 | 400 / 600 | Card titles in Magazine mode |
| `--display-md` | 28 / 32 | 400 | Sanctuary headlines (lowercase italic) |
| `--headline-lg` | 22 / 28 | Söhne 500 | Screen titles |
| `--headline-md` | 18 / 24 | Söhne 500 | Subsections |
| `--body-lg` | 16 / 24 | Söhne 400 | Default body |
| `--body-md` | 14 / 20 | Söhne 400 | Secondary body, captions |
| `--label` | 12 / 16 | Söhne 500 | Buttons, labels, metadata |
| `--micro` | 10 / 14 | Söhne 600, letter-spacing 0.12em, uppercase | Section eyebrows, tags, tracking labels |

### Typography rules

1. **Magazine display = monumental + uppercase.** When in doubt, make it bigger.
2. **Sanctuary display = lowercase + italic.** A whisper. Compare *"YOURS."* (Magazine) to *"yours, since march."* (Sanctuary) — same brand, different rooms.
3. **Eyebrows are uppercase, tracked 0.12em, in `--smoke-300`.**
4. **Tabular numerals everywhere.** `font-variant-numeric: tabular-nums`. Never proportional in UI.
5. **Italics are reserved.** Migra Italic is the brand's signature voice. Never italicize for emphasis-in-prose.
6. **One serif + one grotesque per screen.** Never two serifs. Never three families.

### The wordmark

Migra Italic, set in `--ink` on `--paper` or `--paper` on `--void`. Optional ligature mark sits in `--power` only — never any other color.

---

## 8. Iconography & Imagery

### Photography — three image categories, no fourth

1. **Magazine hero** — full-bleed, model + garment, cinematic natural light, slight warm grade. 4:5 portrait on mobile, 16:9 widescreen on desktop. **Autoplay video where possible, muted, looping.**
2. **Cutout product** — garment on `--bone` (Sanctuary) or `--void` (Magazine), single subtle shadow, sharp focus.
3. **User capture** — the photo the user takes. Treated with a near-imperceptible warm grade. Never auto-cropped to square.

### The "studio light" feel

*Immersive, imaginary realistic, feels like a photo studio.* Every product image — even user uploads — should *appear* to have been shot in a studio with a key light and a fill. We achieve this through:

- Generative background replacement (strip and re-light user uploads against `--bone` or `--void`)
- Soft directional shadows that match the chosen register
- A consistent warm-cool grade across all imagery in a single session

### Photography bans

- ❌ Flat lays from above with props
- ❌ Model-with-coffee-cup lifestyle shots
- ❌ Before/after splits
- ❌ Grid collages of multiple looks
- ❌ Heavy filters (Valencia, Lo-Fi, VSCO presets)
- ❌ Photographs of phones/devices/screens within imagery
- ❌ Stock photography in any context

### Iconography

- **Stroke-based, 1.5px weight, square caps.** Lucide icon set is the baseline.
- **Filled icons only for active state in tab bar.**
- **Never use icons inside buttons** unless icon-only.
- **No mascots, no illustrations of people, no decorative spot illustrations.**
- **The shutter button is the one custom-drawn glyph.** Everything else is Lucide.

---

## 9. Layout & Grid

### Spacing scale (4pt base)

```
--space-1: 4px      --space-6: 32px
--space-2: 8px      --space-7: 48px
--space-3: 12px     --space-8: 64px
--space-4: 16px     --space-9: 96px
--space-5: 24px     --space-10: 128px
```

### Grid

**Mobile (default, 320–767px):** 4-column grid, 16px gutter, 20px outer margin. Magazine: full-bleed hero. Sanctuary: 2-up card grid, 12px gap.

**Tablet (768–1023px):** 8-column grid, 20px gutter, 32px outer margin. Sanctuary: 3-up grid.

**Desktop (1024px+):** 12-column grid, 24px gutter, 64px outer margin. Magazine hero spans 12 cols; caption block spans cols 3–10. Sanctuary: 4-up grid.

### Density principle

**Mobile is editorial. Desktop is power-user.** Mobile shows one thing at a time, full-bleed. Desktop permits denser browsing (4-up cards, multi-column metadata).

### Corner radii — luxury is sharp

| Token | Value | Use |
|---|---|---|
| `--radius-none` | 0 | **Default.** Cards, image containers, hero blocks, modals. |
| `--radius-xs` | 2px | Inputs, search field, starter-pack tiles |
| `--radius-sm` | 4px | Buttons (the maximum for any structural component) |
| `--radius-pill` | 999px | Filter chips and tags ONLY |

**Hard rule: nothing has corner radius >4px except filter chips.**

---

## 10. Core Components

### The Item Card — THE component

**Sanctuary variant (closet):**
- 4:5 cutout image on `--bone`, no rounded corners, no shadow
- Caption block: 16px padding, left-aligned, three lines max
- Eyebrow (`--micro`, `--smoke-300`) → item name (`--headline-md`, `--ink`, lowercase) → metadata (`--body-md`, `--smoke-300`)
- Tap target: entire card. Long-press: context menu. Hover (desktop): 1.02 scale, 400ms ease-out.

**Magazine variant (Discover):**
- 4:5 full-bleed image. Autoplay loop where possible.
- Eyebrow uppercase tracked → display headline in Migra Italic → caption in `--smoke-300`

### The Outfit Composition

Moodboard, not grid. Items overlap, varied scales, asymmetric. Background `--bone` (Sanctuary) or `--void` (Magazine). Caption underneath: occasion + season + last-worn date.

### The Camera Capture Surface — three-state spec (validated)

The defining first-use moment. Spec'd and prototyped.

**State 1 — Viewfinder**
- Full-screen unfiltered camera feed.
- Top bar: `← cancel` (lowercase, `--paper`/70% opacity) on the left. Eyebrow `FRAME THE PIECE` (`--micro`, uppercase tracked, `--paper`/85%) center.
- Bottom: 36–48px shutter dot in `--power` with 3px white-glow ring at 18% opacity.
- No grids. No AR overlays. No corner detection. Nothing else.

**State 2 — Loading**
- Background `--paper`. Top: `← cancel` (`--smoke-300`).
- Center: `reading the piece...` in Migra Italic, lowercase, ~17px, `--ink`.
- Subcaption beneath: `ABOUT A SECOND` in `--micro`, `--smoke-300`.
- The headline pulses at 2.4s (opacity 0.5 → 1 → 0.5) — the editorial pause.
- Max duration: 1.2s. After, push to State 3.

**State 3 — Result**
- Background `--paper`. Top: `← retake` (`--smoke-300`) — note: not "cancel" anymore.
- Eyebrow `JUST CAPTURED`. Stage block (`--bone` background) with the cutout silhouette of the captured garment, full-width margin-bleed.
- Editorial three-line caption in Migra Italic, lowercase: `white crew-neck. / mid-weight cotton. / photographed on bone.` Last line in `--smoke-300`.
- Primary CTA: `SAVE TO CLOSET` — `--ink` fill, `--paper` text, uppercase tracked.

### The Onboarding Flow — three-state spec (validated)

**State 1 — Starter pack**
- Background `--paper`. Eyebrow `STARTING POINT`. Headline `you probably own these.` (Sanctuary lowercase italic, `--display-md`).
- Subcaption `tap what you have.` in `--smoke-300`.
- 2×3 grid of 6 tiles: white tee, black tee, blue oxford, indigo denim, black denim, white sneaker.
- Tile default state: `--bone` fill, no border, garment silhouette + caption.
- Tile confirmed state: `--paper` fill, 0.5px `--ink` border, 10px `--signal` Red dot top-right with white checkmark.
- Bottom-right CTA: `continue →` in `--ink`, weight 500.
- The user never types anything in onboarding.

**State 2 — Persona pick**
- Background `--paper`. Eyebrow `ONE MORE THING`. Headline `you usually dress for…` (Sanctuary lowercase italic).
- Three large stacked options: `work` / `going out` / `weekend`.
- Default option: `--paper` fill, 0.5px `--ink` border, `--ink` text.
- Selected option: `--ink` fill, `--paper` text. Single-select, one always selected.
- CTA: `begin →` bottom-right.

**State 3 — First signature reveal**
- Magazine register. Background `--void`.
- Eyebrow in `--moment` Yellow: `YOUR FIRST SIGNATURE` — **the only place in the entire product where Moment Yellow appears in V1.**
- Headline `thursday.` in Migra Italic, lowercase, `--paper`, ~22px.
- Outfit composition (3 garments overlapping) on `--void`.
- Caption: `camel jacket · oxford · indigo denim` in `--smoke-300`. Subcaption: `— your moment.` with `your moment` in `--moment` Yellow.
- Bottom: tab bar visible (returning to main app).

### Filter Chips

Pill shape (`--radius-pill`). Default: 0.5px `--smoke-200` border, transparent fill, `--ink` text. Active: `--ink` fill, `--paper` text. Single row, horizontal scroll.

### Buttons

| Type | Use | Spec |
|---|---|---|
| **Primary (Sanctuary)** | Main action per Sanctuary screen | `--ink` fill, `--paper` text, 4px radius, 12–14px label uppercase tracked |
| **Primary (Magazine)** | Main action per Magazine screen | `--paper` fill, `--void` text, 4px radius, uppercase tracked |
| **Signal** | Confirm, save, add | `--signal` fill, `--paper` text, 4px radius |
| **Power** | Premium, paid actions, generate | `--power` fill, `--void` text, 4px radius |
| **Ghost** | Secondary | 1px `--ink` border, `--ink` text, transparent fill |
| **Destructive** | Delete only, after confirmation | `--signal` fill, `--paper` text |
| **Text-only** | Tertiary | `--ink`, underlined on hover only |

**One primary button per screen. Maximum.**

### Navigation (mobile bottom bar — 4 destinations)

1. **Discover** (Magazine) — leftmost
2. **Closet** (Sanctuary) — left of capture
3. **Capture** (camera) — center, elevated, `--power` shutter dot
4. **Looks** (Sanctuary) — rightmost

Outline icons. Filled active. Labels hidden by default; appear on active tab only. Bar sits on `--paper` with 0.5px `--smoke-200` top border (or `rgba(255,255,255,0.15)` on Magazine).

---

## 11. Motion & Interaction

### Core timing curves

- **Default ease:** `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-cubic, slightly more dramatic than system default)
- **Page transitions:** 400ms
- **Micro-interactions:** 250ms
- **Magazine reveals:** 600ms with subtle scale 1.02 → 1.0
- **The Vanishing:** 1300ms (see below)

### Specific motion specs

#### Image load-in
0% → 100% opacity over 400ms with 1.02 → 1.0 scale. **No skeleton loaders.**

#### Save action
Saved item briefly flashes `--signal` at 30% opacity, then settles. Sanctuary voice *"saved."* appears for 1.2s, then fades.

#### Page transition
Cross-fade 250ms + 4px upward translate. Never slide. Never cube.

#### Pull-to-refresh
Magazine header zooms 1.0 → 1.05 as the user pulls. On release, italic line — *"refreshing the issue."* — fades in for 800ms.

#### Register transition (Sanctuary ↔ Magazine)
Canvas itself crossfades — `--paper` → `--void` over 400ms. Previous register's content fades and translates up by 8px while new register's content fades and translates from down 8px. The user feels they're stepping into a different room.

#### Loading "breathe"
The Sanctuary loading state's italic Migra text pulses opacity 0.5 → 1.0 → 0.5 on a 2.4s cycle. Editorial pacing — the wait is intentional.

### THE VANISHING — the try-on transition

The defining moment of the product. When a user taps "try on" or "style this" on an item, the existing garment dematerializes and the new one materializes in its place. Like stage magic. Like a film cut.

**Spec (1.3s total):**

1. **Phase 1 — dematerialize (350ms):** Existing garment dissolves. Opacity 1 → 0, blur 0 → 14px, brightness 1 → 1.4, translateY 0 → -18px, scale 1 → 1.04.
2. **Phase 2 — anticipation (250ms):** Empty silhouette holds. Subtle radial glow (`rgba(255,255,255,0.04)` at center on `--void`, or `rgba(0,0,0,0.04)` on `--paper`). Brief.
3. **Phase 3 — materialize (450ms):** New garment particle-assembles. Opacity 0 → 1, blur 14px → 0, brightness 1.4 → 1, translateY +18px → 0, scale 1.04 → 1.
4. **Phase 4 — settle (250ms):** Final 1.04 → 1.0 scale settle.

**Total duration:** 1300ms. Not faster. Not slower. **The wait is the magic.**

**Voice during the Vanishing:** silence. No copy on screen. Single haptic medium-impact at Phase 3 onset (450ms after press).

**Reduced-motion fallback:** 400ms opacity-only crossfade. No blur. No transform.

### Motion bans
- ❌ Spring physics on UI chrome
- ❌ Parallax on text
- ❌ 3D card flips
- ❌ Autoplay sound
- ❌ Pulse animations on CTAs to attract attention
- ❌ Bounce-in modals

### Haptics
- Camera shutter: medium impact
- Save: light tick
- Vanishing materialize: medium impact (Phase 3 onset)
- Destructive confirm: heavy impact
- Everything else: none

---

## 12. Cold-Start & Empty States

**The blank screen is the enemy. Every "empty" state is a designed editorial moment.**

### First-launch experience
1. **Cover screen:** full-bleed cinematic autoplay video. Magazine register. Title in monumental Migra italic *"this week."* Single CTA at bottom: `Begin.`
2. **Starter pack:** the 6-tile flow per §10. Estimated time: 15s.
3. **Persona pick:** the single-question flow per §10.
4. **First signature reveal:** Magazine register, Moment Yellow eyebrow, generated outfit per §10.
5. **Always-on Discover:** even if user skips everything above, Discover is fully populated with resurrected trends, curated influencers (3 rotating per week), and editorial features. **Never empty.**

### Empty closet
*"start with what you own. the basics, below."* [Inline starter pack tiles]

### Empty looks
*"no looks yet. we styled the first three."* [`See them.` ghost button]

### Empty search results
*"not in your closet. three close matches found."* [transitions to shopping discovery surface — Magazine register]

### Permission denials (camera, photos)
*"the camera is the input. enable it in settings, then come back."* [`Open settings.` button]

---

## 13. Accessibility & Responsive Standards

### WCAG 2.1 AA — non-negotiable, target AAA
- Body text contrast ≥ 7.0:1
- Interactive contrast ≥ 4.5:1 against adjacent surfaces
- All interactive elements ≥ 44 × 44pt tap target on mobile
- Alt text in editorial voice (*"white crew-neck, mid-weight cotton, photographed on bone"* — not *"image of t-shirt"*)
- `prefers-reduced-motion` falls back to opacity-only transitions; the Vanishing falls back to a 400ms crossfade
- Keyboard navigation supported throughout; focus state is 2px `--ink` (or `--paper` on Magazine) outline at 2px offset

### Responsive standards
- Mobile-first. Every component designed at 375px first.
- Tablet is mobile-with-more-room.
- Desktop unlocks editorial layout.
- Feature parity across breakpoints.

### Performance budget
- LCP under 2.0s on a mid-range mobile device
- Hero video loads at 720p first, swaps to 1080p on bandwidth check
- The Vanishing at 60fps on a 2021-era phone (iPhone 13 / Pixel 6 baseline) — fall back to 400ms crossfade if not achievable
- Total JS bundle under 200KB for the first interactive screen

---

## 14. Implementation Handoff

### Recommended tooling

**Primary: Claude Code** (Anthropic's terminal-based agent).
- The DESIGN.md → code workflow is its native pattern. Drop this file in the repo root, the agent reads it before every task.
- Agentic by default. Scaffolds full screens with shared components.
- Plays directly with claude.ai/design's "Bundle for Claude Code" export.

**Alternative: Cursor.**
- Use if you prefer an IDE feel (file tree, multi-cursor, side panels).
- Composer mode is close to Claude Code's agent.

**Avoid for V1:**
- VS Code + Copilot alone — too manual for an MVP this size.
- Codex (OpenAI's) — better for backend/algorithmic work; less idiomatic for design-heavy UI.

### Recommended stack

**Mobile-native target (the right answer given camera dependency):**
- **Expo** (managed workflow) + **React Native** + **Reanimated 3** + **Skia** (for the Vanishing's particle effects).
- TypeScript throughout.
- Zustand for state, TanStack Query for data, MMKV for local storage.
- For ML on-device garment cutout: **Vision** (iOS) / **MLKit** (Android) via Expo native modules.

**Web validation prototype (faster to ship, useful for early feedback):**
- **Next.js 15** + **TypeScript** + **Tailwind** (with custom theme matching tokens) + **Framer Motion**.
- Mobile-first responsive. Port to native after validation.

The DESIGN.md is portable across both. Tokens become CSS vars (web) or a theme object (RN). Same source of truth.

### Repository conventions

```
project-root/
├── DESIGN.md          ← this file (authoritative)
├── AGENTS.md          ← engineering conventions for AI agents (separate concern)
├── tokens/
│   ├── colors.ts      ← derived from §6
│   ├── type.ts        ← derived from §7
│   └── motion.ts      ← derived from §11
├── components/
│   ├── ItemCard/      ← see §10
│   ├── OutfitComposition/
│   ├── CameraSurface/  (3-state per §10)
│   ├── StarterPack/    (6-tile per §10)
│   ├── PersonaPick/    (3-option per §10)
│   ├── FirstSignature/ (Moment Yellow per §10)
│   └── Vanishing/      (1.3s per §11)
└── screens/
    ├── Discover/      (Magazine)
    ├── Closet/        (Sanctuary)
    ├── Looks/         (Sanctuary)
    └── Capture/       (Sanctuary, full-screen)
```

### Prompt template for any agent

```
GOAL: [what this screen accomplishes for which persona, in which register]
LAYOUT: [format — full-bleed Magazine hero / Sanctuary 2-up cards / camera surface / etc.]
CONTENT: [specific copy, items, imagery references — IN-REGISTER VOICE]
CONSTRAINTS: Apply DESIGN.md. Mobile-first 375px. State the register explicitly.
No purple/blue gradients. No glassmorphism. No rounded corners >4px. True
black + true white canvas — one accent if earned (Signal Red, Power Gold, or
Moment Yellow — never two together). Migra for serif, Söhne for grotesque.
In-register voice. Full-bleed imagery. No stock photography. No emoji.
No skeleton loaders.
```

---

## 15. Open Questions

These remain unresolved. Flag for V4.

1. **Brand name + brand mark.** Currently `StyleMeUp` (working title). The Migra-italic wordmark is a placeholder; a custom ligature in `--power` should replace it.
2. **Premium tier name.** Currently *"Power Mode."* Affects `--power` Gold's voice and upsell copy.
3. **Influencer curation surface.** Editorial credits in `--micro` at the foot of each card, or a dedicated *"masthead"* page?
4. **Sustained-engagement metric.** Daily streak vs weekly looks vs monthly resurrections-tried. Affects what the home screen prioritizes.
5. **Dark mode for Sanctuary parity.** All Sanctuary specs support a dark inverse. Ship at launch or V2?
6. **Localization.** Migra + Söhne cover Latin extended. CJK + Cyrillic need a fallback decision before international launch.
7. **The Vanishing fallback when ML segmentation fails.** Likely a 400ms crossfade with a quiet apology in Sanctuary voice.

### Resolved through prototyping
- ✅ Vanishing duration: **1.3s** (was 1.1s in v2 draft)
- ✅ Camera capture: 3-state spec confirmed (viewfinder, loading, result)
- ✅ Onboarding: 3-state spec confirmed (starter pack, persona pick, first signature)
- ✅ Moment Yellow placement: at first-signature reveal — the canonical V1 use
- ✅ Two-register architecture: validated — Magazine and Sanctuary read distinctly
- ✅ Lowercase italic Sanctuary headers: confirmed

---

## Appendix A — Quick Reference

| | |
|---|---|
| **Magazine canvas** | `--void #000000` |
| **Sanctuary canvas** | `--paper #FFFFFF` |
| **Body text (Sanctuary)** | `--ink #0A0A0A` |
| **Body text (Magazine)** | `--paper #FFFFFF` |
| **Signal accent** | `--signal #E10600` (the "yes") |
| **Power accent** | `--power #B8954A` (premium) |
| **Moment accent** | `--moment #FFD60A` (used once per user) |
| **Display serif** | Migra (Pangram Pangram) — italic for editorial |
| **Display grotesque** | Söhne Breit (Klim) — uppercase for monumental |
| **Body grotesque** | Söhne (Klim) — both registers, tabular nums |
| **Free fallback** | Fraunces + Inter (Google Fonts) |
| **Default radius** | 0 (cards, images) / 4px (buttons) / pill (chips only) |
| **Default ease** | `cubic-bezier(0.22, 1, 0.36, 1)` at 400ms page / 250ms micro |
| **The Vanishing** | 1.3s (350 + 250 + 450 + 250) |
| **Mobile breakpoint** | 375px first, 4-col grid, 20px margin, 16px gutter |
| **Voice test** | Would *Vogue* publish this sentence? Would Burberry put it in a campaign? |
| **Register test** | Is this screen Magazine or Sanctuary? If you can't answer in one word, redesign. |

---

## Appendix B — The Mandate, Restated

We are a **confidence engine**. We make the user feel like the version of themselves they already are — but better dressed. We do this through two emotional rooms (Magazine and Sanctuary), one shared visual language (true black, true white, three earned accents), and a defining transition (The Vanishing) that turns a styling app into magic.

The user opens us daily. They never regret the subscription. They feel safe in the Sanctuary and seduced in the Magazine. They never see a blank screen, a sparkle emoji, or a sentence we wouldn't put in a Burberry campaign.

If a screen, component, or copy line doesn't ladder back to that, it doesn't ship.

---

*v3 · canonical · supersedes v1 and v2 drafts · Owner: Sid · Last updated: 2026-04-30*
