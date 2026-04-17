# Spec: Training Editor (/dashboard/trainings/[id])

Drop this into `design_handoff_hirefunnel/` and point Claude Code at it.

## Goal

Replace the current training editor with a three-pane layout matching `Hirefunnel Product Canvas.html` → "Training editor" artboard. Ship incrementally: layout + styling first, drag-reorder second, gate/quiz controls third. Do not touch the public training viewer (`/t/[slug]`) in this pass.

## Overall layout

```
┌───────────── TopNav (shared) ──────────────┐
├─── Subnav bar ─────────────────────────────┤
│ Trainings /  <Course name>  [Draft badge] │  Preview · Publish
├──────────┬───────────────────┬─────────────┤
│ Sections │  Content editor   │  Settings   │
│  300px   │  flex 1           │  340px      │
│  #fff    │  #FAF8F5          │  #fff       │
│ border-R │                   │  border-L   │
└──────────┴───────────────────┴─────────────┘
```

Page fills viewport height. All three panes scroll independently; subnav and topnav are sticky.

### Subnav bar
- 14px 24px padding, `#fff` bg, `1px solid #EDE6D9` bottom border.
- Breadcrumb `Trainings /` in dim (`#59595A`, 13px), then course name in 15/600.
- `Draft` or `Published` badge (use existing Badge primitive; `brand` tone for draft, `success` for published).
- Flex gap to push actions right: **Preview** (secondary Btn, small) + **Publish** (primary Btn, small). Publish becomes "Update" once first published.

## Left pane — Sections list (300px)

### Header
- `SECTIONS · N` in mono 10px uppercase, letter-spacing 0.1em, color `#59595A`, margin-bottom 10.

### Section row
Each row is a div, not a button (so drag-handle + body are separately hittable):
- 10px × 12px padding, border-radius 8, margin-bottom 4.
- **Active state**: bg `#FFF3DF`, `1px solid var(--brand-primary)`.
- **Inactive**: transparent bg, transparent border.
- **Hover (inactive)**: bg `#F7F3EB`.
- Inside: 10px gap flex row.
  1. **Number chip** — 22×22 circle. Active: bg `var(--brand-primary)`, white text. Inactive: bg `#F1EBE1`, text `#59595A`. Font mono 11/600.
  2. **Title stack** (flex 1, min-width 0):
     - Title: 13/500, truncate.
     - Duration: mono 11, `#59595A`. Show `—` if no video attached.
  3. **Drag handle** — appears on row hover only. SVG 6-dot grip, 14×14, color `#808080`. Cursor `grab`; `grabbing` while dragging.

### "+ Add section" button
Ghost Btn style, small, mono not needed. Opens inline a tiny form: name input + "Create" / "Cancel". Creating appends to the list and selects the new section.

### Drag-reorder (phase 2)
- Native HTML5 DataTransfer. No libs.
- On `dragstart`: set opacity 0.4 on source, `dataTransfer.effectAllowed = 'move'`, stash index.
- On `dragover`: `preventDefault()`, compute insert-above vs insert-below based on pointer Y vs row midpoint, render a 2px `var(--brand-primary)` line at the target edge.
- On `drop`: reorder array, persist via PATCH, clear indicator.
- Keyboard alt: when a row is focused, `Alt+↑` / `Alt+↓` move it.

## Middle pane — Content editor (flex 1)

- Outer padding 32 (desktop), 20 (below 1100px).
- Max content width 720; center in pane.

### Top block
- Eyebrow: mono 10px uppercase `SECTION {n} · {duration}`. Color `#59595A`. Margin-bottom 4.
- h2 24/600 `-0.02em` tracking. Editable inline on click (contenteditable or switch to input); `Enter` saves, `Esc` cancels. Autosave with 500ms debounce. Margin-bottom 20.

### Video block
- Aspect-ratio 16/9 div.
- If a video is attached: dark gradient placeholder (`linear-gradient(135deg, #2d4a3e, #1a2d26)`) until the real `<video>` is wired; overlay a 60px circular play button (rgba(255,255,255,0.9) bg, ink fg) centered.
- If **no video**: replace gradient with dashed-border drop zone. Same aspect ratio. Center stack: 32px upload-cloud icon + "Drop a video here or click to browse" + mono 11 sub "MP4, MOV, WEBM · up to 500MB". Hover tints border to `var(--brand-primary)`.
- Below video, small Btn row: **Replace video** (secondary small) · **Record new** (secondary small) · **Remove** (ghost small, `#A93A2C` text).

### Description block
- Rich-text editor (use what the codebase already has — TipTap, Lexical, whatever). If none, plain textarea with these styles: `1px solid #EDE6D9`, radius 10, padding 14, font 14/1.6, bg `#fff`, min-height 180.
- Placeholder: "What will candidates learn in this section?" in `#808080`.

### Quiz block (phase 3)
Only shows if section has `quiz: true` toggled in settings.
- Card: `#fff`, `1px solid #EDE6D9`, radius 14, padding 20.
- Header: "Quiz · {N} questions" + "+ Add question" ghost small.
- Each question row:
  - Question text input (14/500).
  - Type selector segmented control (Multiple choice · True/False · Short answer).
  - Options list for MC: each option row = text input + radio for "correct" + trash icon.
  - Margin-bottom 16 between questions, `1px solid #F1EBE1` divider.
- Empty state: "No questions yet. Add one to gate this section."

## Right pane — Settings (340px)

Padded 20. `#fff` bg, `1px solid #EDE6D9` left border.

### Section-settings group
Label: `SECTION SETTINGS` mono 10 uppercase. Margin-bottom 12.

Use this small-field pattern (same as Flow builder branding):
```jsx
<Field label="VIDEO SOURCE">
  <Select value="intro-deescalation.mp4" options=[library videos] />
</Field>
```

Fields:
1. **Video source** — select from video library. Shows duration & transcribed badge next to name.
2. **Gate** — segmented: `None · Must watch ≥80% · Must pass quiz`. When "quiz" is chosen, require the quiz block to have ≥1 question before allowing publish.
3. **Quiz** — toggle (reveals quiz block in middle pane).
4. **Estimated duration** — auto-filled from video; override input.

### Enrollment group
Label: `ENROLLMENT` mono 10 uppercase. Margin top 24, bottom 12.

Two-column grid of MiniStat chips (`#F7F3EB` bg, radius 8, padding 10):
- **Enrolled** — total count.
- **Completed** — count + percentage in parens.
- **Avg. time** — mm:ss.
- **Quiz pass rate** — only if gate = quiz; color `#1F6A3A` if ≥70%, `#8A6500` if 50–69%, `#A93A2C` if <50%.

### Course-level settings
Shown when no section is selected (click breadcrumb or "Course settings" button at top of sections pane). Replace middle pane content too: `Overview · Pricing · Cover image · Public slug · Access control`.

## Empty states

- **No sections yet** — sections pane shows a centered block: "Your training course is empty" + "+ Add your first section" primary Btn. Middle pane shows a large illustration placeholder + "Select or create a section to start."
- **Section with no video** — drop zone as described; middle pane is functional but Publish is disabled with tooltip "Section 2 needs a video".

## Publish flow

- **Publish** button click opens a drawer/modal listing pre-flight checks:
  - All sections have a video ✓ / ✗
  - All gated sections have ≥1 quiz question ✓ / ✗
  - Cover image set ✓ / ✗ (warn, not block)
  - Public slug available ✓ / ✗
- Bottom of drawer: **Publish now** primary Btn (disabled if any ✗). Cancel secondary.
- After publish: badge flips to `Published`, button label becomes `Update`.

## Interaction notes

- **Autosave** everywhere — 500ms debounce on text fields, immediate on toggles/selects. Show a tiny mono "Saved" chip top-right of subnav that fades after 1s.
- **Keyboard**:
  - `⌘+S` forces save + flashes Saved chip.
  - `⌘+↑` / `⌘+↓` jump between sections.
  - `Esc` deselects section (returns to course settings).
- **Confirm destructive actions**: deleting a section shows a small inline confirm ("Delete section 3? This removes its video & quiz data. [Delete] [Cancel]").

## Design tokens (recap)

Already in your codebase after the chrome migration — don't redefine. This screen only uses existing tokens + the status tone palette + the Card/Btn/Badge primitives.

## Out of scope for this pass

- AI transcript generation — keep the existing backend call; no UI changes.
- Multi-language / localization per section.
- Per-candidate progress timeline within a section.
- The public `/t/[slug]` viewer interior (quiz grading etc.) — explicitly deferred.

## Suggested implementation order for the agent

1. Scaffold the 3-pane layout + subnav with static data. Ship behind no flag — it replaces the current page straight away.
2. Wire the sections CRUD (create, rename, delete) and section-selection state.
3. Hook the existing video-picker modal to the "Video source" field.
4. Add drag-reorder.
5. Add the quiz block (if the product wants it now; otherwise defer to phase 3).
6. Publish pre-flight drawer.

Ask me before: adding a mini-map, mass-duplicate, or section-templates feature. Those are separate product calls.
