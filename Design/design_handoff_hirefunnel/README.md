# Handoff: Hirefunnel Design Refresh

## Overview

This package contains design references for **Hirefunnel**, a branching video-interview platform. Recruiters build multi-step video flows; candidates answer via pre-recorded video prompts; admins review submissions, run analytics, manage scheduling, and publish training courses.

The designs cover the full product surface area: admin (dashboard, flows, candidates, analytics, scheduling, videos, trainings, branding), public pages (marketing, sign-in, public training), the platform-admin console, and the candidate-facing flow player (3 variants).

## About the Design Files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. Your job is to **recreate these designs in the existing Hirefunnel codebase** using its established framework, components, and patterns. Treat the HTML as a visual spec — lift tokens, spacing, copy, and component shapes, but wire them through your real components, routing, and state.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, component shapes, and copy are all intentional. Recreate pixel-perfectly where your existing component library allows. Where it doesn't, match as closely as possible and flag the gap.

There are some deliberate gaps:
- Avatars and video thumbnails are placeholders (initials on solid fills, gradient rectangles). Swap with real data.
- Logo is a lowercase "h" in an orange rounded-square. Replace with final mark when ready.
- Numbers in charts/tables are mock data.

## Design Tokens

All of these are already wired as CSS vars in the prototypes — ideally surface them as the equivalent in your codebase (Tailwind theme, CSS vars, styled-system, etc.).

### Colors
```
--brand-primary:  #FF9500   /* orange — primary CTAs, accents, active nav */
--brand-dim:      #FFF3DF   /* orange wash — active nav bg, selected row bg */
--ink:            #1a1815   /* near-black text, dark buttons */
--bg:             #FAF8F5   /* warm off-white app bg */
--card:           #FFFFFF
--border:         #EDE6D9   /* card/table borders */
--divider:        #F1EBE1   /* table row dividers */
--dim:            #59595A   /* secondary text, inactive nav */
--muted:          #808080   /* tertiary text */
```

**Status tones** (use these everywhere — badges, score colors, delta indicators):
```
success:  bg #E6F4EA  fg #1F6A3A
warn:     bg #FEF2D0  fg #8A6500
danger:   bg #FDE4E1  fg #A93A2C
info:     bg #E6EFF8  fg #2E5A88
brand:    bg #FFF3DF  fg #C2710A
neutral:  bg #F1EBE1  fg #59595A
```

### Typography
```
--body-font:    'Be Vietnam Pro', system-ui, sans-serif    /* all UI text */
--display-font: 'Be Vietnam Pro', system-ui, sans-serif    /* headings */
--mono-font:    'Geist Mono', ui-monospace, monospace      /* labels, eyebrows, numbers */
```

**Type scale** (px; all -0.02em tracking on h1/h2 except mono):
- Display / h1: 26–64 / 600
- h2: 20–24 / 600
- Section eyebrow (mono, uppercase, letter-spacing 0.1–0.14em): 10–11
- Body: 13–15 / 400–500
- Small / meta: 11–12

Mono is used *heavily* for eyebrows, table headers, IDs, durations, counts — it's a signature move of this design. Don't accidentally collapse those to sans.

### Spacing / radius / shadow
```
--btn-radius:     10px   (tweakable: 2px 'square' · 9999px 'pill')
card radius:      14px
inner elements:   6–10px
input radius:     8–10px
table cell padding: 10–14px × 16px
page padding:     24–40px
shadow (cards):   0 2px 6px rgba(26,24,21,0.06)
shadow (raised):  0 10px 30px -10px rgba(26,24,21,0.15)
```

## Screens

All admin screens share the same chrome: 60px top nav with logo + org pill + section tabs + search + "+ New flow" + avatar. Page header below with eyebrow (mono uppercase), h1, description, and right-aligned actions.

### Admin
1. **Dashboard** (`/app`) — 4 stat cards + recent-candidates list + this-week's-interviews card.
2. **Flows list** (`/app/flows`) — filter pills + 3-col card grid. Each card: cover with step/branch count, status badge, slug in mono, metrics.
3. **Flow builder — Schema** (`/app/flows/[id]/schema`) — dot-grid canvas with connected nodes (start/mid/end variants), floating right-side editor panel for the selected step, sub-nav tab group.
4. **Flow builder — Branding** (`/app/flows/[id]/branding`) — left settings panel (logo, color swatches, type, radius, custom domain), right live preview on a warm-gray surface.
5. **Submissions viewer** (`/app/flows/[id]/submissions`) — split: left table of candidates, right detail panel (avatar, score/time/stage chips, Q&A stack).
6. **Candidates** (`/app/candidates`) — kanban-style 4-column pipeline (New / Advancing / Hired / Rejected).
7. **Scheduling** (`/app/scheduling`) — week grid, time rows × day columns, booked slots rendered as orange-tinted blocks.
8. **Videos library** (`/app/videos`) — 4-col grid, dark gradient thumbs with play-button overlay and duration pill, filename in mono.
9. **Trainings list** (`/app/trainings`) — 3-col grid with large gradient cover + sections/enrolled count.
10. **Training editor** (`/app/trainings/[id]`) — 3-pane layout: sections sidebar, main video+content area, settings sidebar.
11. **Analytics** (`/app/analytics`) — **priority screen**. 4 stat cards (total subs, completion, avg time, drop-off point) + funnel bar chart (with exact drop-off counts inside each bar) + source breakdown + per-flow performance table with sparklines.

### Public
12. **Marketing** (`hirefunnel.co`) — hero with "Hire people, not *résumés*" (italic orange on "résumés"), subhead, CTA pair, hero placeholder, 3-column features.
13. **Sign in** (`/auth`) — split screen: left form (Google/Microsoft SSO, magic link), right testimonial on forest-green gradient.
14. **Public training** (`/t/[slug]`) — hero on deep-green gradient with org name + course name + metadata chips, then numbered course-outline list.

### Platform
15. **Platform admin** (`/platform`) — dark top-bar (different from customer workspaces to signal staff-only), org table with plan/status badges and "Impersonate" action.

### Candidate flow (separate prototype)
The candidate interview experience has 3 variants in `Hirefunnel Candidate Flow.html`:
- **Classic** — video left, question panel right (sidebar).
- **Cinema** — full-bleed video with overlaid glass question card.
- **Paper** — editorial, video above, questions below on warm paper.

All 3 support Tweaks: primary color, font pair (Modern / Editorial / Classic), button shape, panel position, progress indicator style, light/dark, auto-advance.

## Interaction Notes

- **Branching logic** — each step can have multiple options; each option has a `next` step pointer. Build an engine that walks a graph, not a linear array.
- **Video submissions** — record-in-browser (MediaRecorder) with min/max duration enforced per step.
- **Progress indicators** — 4 styles (bar, dots, stepper, none) driven by an org/flow setting. Stepper is default.
- **Auto-advance** — optional toggle; when on, answering advances immediately (no "Next" click). Off by default.
- **Saving progress** — mid-flow resumes via session token in URL; preserve answers on reload.
- **Anti-AI screening** — not designed here; mentioned in marketing copy only.

## Table patterns (used everywhere)
- Header row bg `#FCFAF6`, mono uppercase 10px labels.
- Row divider `1px solid #F1EBE1`.
- Score column colored by value: ≥80 green, 60–79 ink, <60 danger.
- Status badges always in the rightmost data column.
- Sparklines 80×22 at the row end, stroke = brand or green based on metric.

## Files

- `Hirefunnel Product Canvas.html` — single page with all 14 admin/public/platform screens on a pan/zoom Figma-style canvas. Open this first.
- `Hirefunnel Candidate Flow.html` — interactive candidate-side prototype, 3 variants + Tweaks panel.
- `ui.jsx` — shared React components (TopNav, PageHeader, Btn, Badge, Card, Stat, Sparkline) with exact tokens.
- `screens-part1.jsx` + `screens-part2.jsx` — every admin/public screen.
- `variant-classic.jsx` / `variant-cinema.jsx` / `variant-paper.jsx` — candidate-flow variants.
- `primitives.jsx`, `engine.jsx`, `data.jsx` — shared candidate-flow utilities + mock flow graph.
- `mock-data.jsx` — admin-side mock data (flows, candidates, videos, trainings, funnel, daily submissions).
- `design-canvas.jsx` — the Figma-style canvas wrapper (reference only; don't port).

## Recommended implementation order

1. Commit the design tokens as theme values in your existing styling system first. Nothing else lands cleanly until these match.
2. Rebuild shared chrome (TopNav, PageHeader, Btn, Badge, Card, Stat, Sparkline) against your framework and replace any equivalents.
3. Tackle **Analytics** — it's the most complex layout and will exercise most of your primitives.
4. Migrate flow builder screens — Schema canvas is the biggest custom piece; everything else is list/table/form.
5. Candidate flow variants can ship behind a feature flag; Classic is the safe default.

## Open questions to confirm with design

- Do you want the wordmark swapped from "HiringFlow" to "Hirefunnel" across the app? (The designs use Hirefunnel.)
- Should the platform-admin top-bar stay dark ink, or match the customer chrome with an "ADMIN" badge only? (Designs: dark bar.)
- Avatar source of truth — Gravatar, upload-to-S3, or initials fallback only?
