# Loop Plugin UX Redesign — Design

**Date:** 2026-06-06
**Status:** Approved (pending implementation plan)
**Scope:** Webview presentation only — `resources/plugins/manifold.loop/src/webview/`

## Goal

Modernize the entire Autoresearch Loop panel through *restructure + polish*. Keep every
existing field and capability; change only how things are organized and presented. The
current form is a flat vertical wall of all-caps mono labels with uniform visual weight and
plain disclosure bars. The redesign introduces clear hierarchy (Task → Scoring → Limits), a
segmented metric selector, sentence-case field labels, a cohesive live-run card, and a
score-trend visualization.

**Non-goals:** No changes to the engine, protocol, host bridge, or persisted config shape.
This is purely a webview re-skin + re-layout.

## Constraints

- **Token-only colors.** No hardcoded hex/rgb in `*.styles.ts`. Every mockup color maps to an
  existing `var(--token)`:
  - gold accent `#e4c693` → `--accent` / `--accent-text`; gold tint → `--accent-subtle`
  - green → `--status-done`; amber → `--status-waiting`; red → `--status-error`;
    running green → `--status-running`
  - surfaces → `--bg-primary` / `--bg-secondary` / `--bg-elevated`; borders → `--border` /
    `--divider` / `--control-border`
- **Theme-agnostic structure.** Layout, spacing, radius, shadows identical across all themes.
  No theme-conditional logic.
- **300-LOC ceiling per file.** `LoopConfigForm.tsx` (currently 234 LOC) will grow, so it is
  split into focused sub-components (see File Structure).
- **No new dependencies.** Trend strip is plain CSS/divs, not a charting library.

## Decisions locked during brainstorming

1. **Config form structure: Direction B — refined single flow** (chosen over sectioned cards
   and a stepped wizard). One airy column, hairline-grouped, all fields visible at once —
   best for a panel revisited often to tweak-and-restart. Borrows small uppercase section
   headers from Direction A.
2. **Score-trend strip: kept**, auto-hidden until ≥2 iterations exist.

## The Design

### 1. Visual language

- **Field labels** become sentence-case questions (e.g. "What should the agent do each
  iteration?"). All-caps mono is dropped for field labels.
- **Section headers** (Task / Scoring / Advanced) remain small uppercase micro-labels — this
  matches the app's existing section-label convention and provides scannable structure.
- **Fonts:** prose fields (program, judge rubric) use `--font-sans`; value-bearing fields
  (eval command, target globs, regex, JSON path, numeric budgets) keep `--font-mono`.
- **Inputs:** `--bg-input` background, `1px solid --control-border`, `--radius-sm`. Focus-visible
  ring per the design system (`0 0 0 2px --accent-subtle, 0 0 10px --accent-subtle`).
- **Grouping** via hairline `--divider` rules and `--space-md`/`--space-lg`, not nested boxes.

### 2. Config form — idle state

A single form column with three hairline-separated groups:

- **Task**
  - Label row: "What should the agent do each iteration?" + **Improve with AI** chip
    (restyled as a subtle `--accent` pill in the label row; keeps existing busy/disabled states
    and `✦` sparkle animation).
  - Program textarea (hero — taller, `--font-sans`).
  - "Files it may edit" (target globs) with hint "leave blank to allow edits anywhere".
- **Scoring**
  - "How is each attempt scored?" → **segmented pill control**:
    `Exit code · Stdout regex · JSON path · LLM judge` (replaces the `<select>`).
  - Eval command (hint changes per metric, as today).
  - Metric-dependent fields reveal beneath: **max score** (llm-judge), **judge rubric**
    (llm-judge), **regex pattern** (stdout-regex), **JSON path** (json-path),
    **direction** minimize/maximize (stdout-regex & json-path).
- **Advanced** — restyled collapsed `<details>`: budget (seconds), max iterations,
  "Roll forward regardless of score", "Clear agent context between iterations". Same fields,
  same hints, same `open={form.alwaysAdvance}` behavior.
- **Action row** — primary **Start Loop** + secondary **Save**.

### 3. Live-run state

When `loop.status.state === 'running'`, the form is replaced by a single **LiveRunCard**
(consolidates today's separate status-bar + pending-iteration-card):

- Pulsing `--status-running` dot + `Running · iteration N`.
- Elapsed timer (derived from the running iteration's `startedAt`).
- Inline **Stop** button.
- `best X / max` badge (`--accent-subtle` / `--accent`) + `▲ delta from baseline` in
  `--status-done` when an improvement exists.
- Existing sweep progress bar (`loop-progress-sweep` keyframe).
- One-line meta: editing `<globs>` · eval `<command>` · `<budget>`s budget.

### 4. Score-trend strip + history

- **ScoreTrend** — a CSS bar trend rendered above the history when `iterations.length >= 2`.
  Bars scale to score / maxScore; best bar in `--accent`; regressed iterations dimmer
  (`--status-waiting`-tinted); baseline marked. Hidden for 0–1 iterations.
- **IterationList** (restyled) — newest-first rows:
  - Colored **left-border per outcome** (`--status-done` improved, `--status-waiting`
    regressed, `--status-error` failed, `--text-muted` aborted).
  - Outcome chip, score badge, commit sha (or error reason), expandable `▸ judge` (unchanged
    expand behavior, restyled `<pre>`).
  - **Best iteration** highlighted: `--accent-subtle` row tint + ★ marker. "Best" = the
    iteration whose `commitSha === status.bestCommitSha`.

### 5. Supporting states

- **Empty state** (no session selected): centered, muted glyph + existing copy, restyled.
- **Intro / "What is this?"**: restyled subtle `<details>` shown at top when idle; same copy
  (Good for / Avoid for).
- **Header actions** (Stop / Restore Best / Clear) + restore toast: kept, restyled to the new
  button language. Restore-best single-flight + 4s toast behavior unchanged.
- **Errors**: start error + AI-improve error styled with `--status-error`.

## File Structure

All under `resources/plugins/manifold.loop/src/webview/`.

**New components** (`components/`):
- `SegmentedControl.tsx` — reusable pill segmented selector (used for metric kind).
- `ScoringFields.tsx` — segmented metric + all metric-dependent fields.
- `AdvancedSection.tsx` — the Advanced `<details>` block.
- `LiveRunCard.tsx` — running-state card (replaces inline status bar + PendingIterationCard).
- `ScoreTrend.tsx` — bar-trend strip.

**Modified components:**
- `LoopConfigForm.tsx` — slimmed to the idle-form composition (Task group + `<ScoringFields>`
  + `<AdvancedSection>` + action row). Stays < 300 LOC.
- `LoopPanel.tsx` — state router: idle (intro + form) vs running (LiveRunCard); renders
  ScoreTrend + IterationList; keeps header actions + restore toast.
- `LoopIterationList.tsx` — restyled rows, outcome left-border, best-row highlight.

**Styles** (`styles/`): extend the existing `form.styles.ts` / `panel.styles.ts` /
`iteration.styles.ts` (and add a `liverun.styles.ts` if `panel.styles.ts` approaches 300 LOC),
all merged via `styles/index.ts`. New tokens only if no existing token fits (check `theme.css`
first).

**Keyframes** (`keyframes.ts`): reuse existing `dot-blink`, `spin`, `ai-pulse`,
`loop-progress-sweep`. No new animations unless required.

**Untouched:** `helpers.ts`, `protocol.ts`, `use-loop-bridge.ts`, `loop-state.ts`,
`index.tsx`, and the entire `src/` engine/host (`plugin.ts`, `webview-host.ts`, `engine.ts`,
`types.ts`, etc.). `FormState`, `LoopConfig`, and the message protocol are unchanged.

## Verification

1. Build the plugin (`npm run build` in `resources/plugins/manifold.loop` or the workspace
   build that bundles it) — succeeds.
2. `typecheck:web` and `typecheck:node` — no new errors above the documented baseline
   (web 53 / node 21).
3. Launch Manifold, open the Autoresearch Loop panel, and confirm:
   - Idle form renders with sentence-case labels and the segmented metric control.
   - Switching metric reveals the correct dependent fields (max score/rubric, regex,
     json-path, direction).
   - Improve with AI still rewrites the program (busy/disabled states intact).
   - Save persists; reopening restores the saved config.
   - Start → LiveRunCard appears; iterations populate the history.
   - Trend strip appears only at ≥2 iterations; best iteration highlighted with ★.
   - Stop / Restore Best / Clear all work; restore toast shows.
   - Empty state renders when no session is selected.
4. Diff behavior vs `main` for the above flows — presentation changes only, no behavioral
   regressions.

## Risks / Notes

- The segmented control replaces a native `<select>`; ensure keyboard accessibility
  (arrow/Enter) and disabled state parity.
- Best-iteration detection relies on `status.bestCommitSha`; rows without a commit (failed/
  aborted) are never "best".
- Elapsed timer needs a ticking source in the webview (e.g. `setInterval` while running) since
  the host pushes status on iteration boundaries, not per-second.
