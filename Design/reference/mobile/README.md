# Mobile Navigation Pack — Integration Guide

Five files that add a responsive **side drawer** and **swipe-to-switch** to the Hirefunnel dashboard. All use existing design tokens (`--brand-primary`, `--surface-border`, etc.) and extend the current `TopNav` / layout shape without breaking call sites.

## Files

| File | Drop at | Purpose |
|---|---|---|
| `useSwipeNav.ts` | `src/components/design/useSwipeNav.ts` | Pointer-gesture hook. Returns `{dx, dragging, bind}`. Presentation-agnostic. |
| `SwipeTabs.tsx` | `src/components/design/SwipeTabs.tsx` | Layout wrapper that binds the hook to `<main>` and routes on commit. |
| `MobileNav.tsx` | `src/components/design/MobileNav.tsx` | Hamburger + right-side drawer. |
| `TopNav.tsx` | `src/components/design/TopNav.tsx` (replace) | Hides tabs < md, mounts `<MobileNav>`, compacts search/CTA. |
| `dashboard-layout.tsx` | `src/app/dashboard/layout.tsx` (replace) | Wires `SwipeTabs` + `TopNav`. |

## Wiring

1. Copy the five files in.
2. Export `MobileNav` / `SwipeTabs` from `src/components/design/index.ts` if you want the barrel.
3. Flow builder is already excluded via `SWIPE_DISABLED`. Add any other routes that own horizontal drags (e.g. a future kanban) to that array.

## Behavior contract

- **Breakpoint:** `md` (768px). Desktop is untouched.
- **Drawer:** right-side, scrim + Esc + close button all dismiss, focus trapped while open, body scroll locked.
- **Swipe commit:** 25% of viewport width OR 600px/s flick velocity.
- **Edges:** rubber-bands at 0.35× displacement on first/last tab.
- **Axis lock:** if vertical > horizontal × 1.5 in first 6px, swipe aborts so scroll works.
- **A11y:** drawer traps focus, `Esc` closes, all nav items are real `<a>` / `<Link>`.

## Open decisions

- Avatar-as-drawer-trigger (saves one tap target)?
- Any tabs to hide entirely on mobile (e.g. Branding behind the user card)?
- Grouping once we pass ~12 items (Settings / Branding under a “Workspace” section)?
- Animate the outgoing page during swipe commit, or keep the snap-then-route we have now?
