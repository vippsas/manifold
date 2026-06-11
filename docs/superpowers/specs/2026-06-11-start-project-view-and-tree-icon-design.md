# Start-project view redesign + accent-tinted active tree icon

**Date:** 2026-06-11
**Status:** Approved design, pending implementation

## Context

The "Start a new project" view (`src/renderer/components/sidebar/NoProjectActions.tsx`, hosted
by `OnboardingView`) still uses the pre-#639/#640 design language: a 15px sans heading and flat
accent/secondary buttons. The "New agent" view already uses the newer language — serif
`--font-display` hero heading with italic `--accent-hi` emphasis, segmented mode pill, and a
full-width `.btn-metal` metallic CTA. Decision: bring the project view in line with the agent
view (visual option C — pill + single CTA — chosen via mockups).

Separately, since #640 the file tree renders all icons monochrome
(`grayscale(1) brightness(1.08)` with opacity stepping). Decision: the **active** file's icon
(the file open in the editor) gets an accent tint (visual option C), so "color follows focus."

## Part 1 — "Start a new project" view

### Heading

Replace the sans heading with the agent-view hero treatment:

- Font: `var(--font-display)` at `var(--type-display)`, weight 400,
  `letter-spacing: var(--tracking-tight)`, color `var(--text-primary)`.
- "Start a " plain; "new project" italic, weight 500, `color: var(--accent-hi, var(--text-primary))`
  — mirroring "New agent for *manifold*".
- Ghost wordmark, gold rule, aura + vignette backdrop, and the "Back to workspace" link are all
  rendered by `OnboardingView` and stay untouched.

### Controls: collapse two phases into one

Today: two buttons set `promptMode`, which reveals a textarea phase with an in-textarea "Go"
button and a "Back" button. New: a single always-visible form mirroring `NewAgentForm`:

1. **Textarea** (5 rows, `--bg-input` background, `--border` border, `--radius-md`,
   global focus glow ring). Placeholder switches with the pill:
   - Copied instructions → "Paste the copied project instructions..."
   - From scratch → "Describe what you want to build..."
2. **Segmented pill** below it: "Copied instructions" | "From scratch". Default: **Copied
   instructions** (today's primary action). Reuse the `modeToggleStyles` track/segment styles
   from `NewAgentForm.styles.ts` and the `role="tablist"`/`role="tab"` pattern from
   `NewAgentModePill`.
3. **Full-width `.btn-metal` CTA "Start Project"** — spinner + "Creating…" while busy,
   disabled until the textarea has non-whitespace text. Same layout styling as
   `startButtonStyle` (full width, `--control-height`, `--radius-sm`).

Behavior preserved:

- ⌘↵ in the textarea submits.
- Copied-instructions mode passes `projectKind: 'folder'` to `onCreateNewProject`; scratch
  mode omits it (unchanged from today).
- On success, the textarea clears.

Removed: the in-textarea "Go" button, the "Back" phase button, and the `promptMode === null`
button-pair phase. `promptMode` becomes a non-null `'copied' | 'scratch'` state defaulting to
`'copied'`.

### Below the fold — same structure, same skin

- "or open an existing repository" divider: unchanged structure (hairlines + `--text-muted`
  label).
- "+ Add Local Repository" / "Clone Repository": remain quiet secondaries (`--control-bg`,
  `--control-border`, `--text-primary`).
- Clone-URL reveal form and error-message placement: unchanged behavior.

### Code notes

- Keep the 480px / 90% column width.
- Replace hardcoded paddings/radii with spacing/radius tokens where touched; don't restyle
  untouched parts.
- `NoProjectActions.tsx` is 233 LOC; if the rework pushes it near 300, extract
  `NoProjectActions.styles.ts` (per max-300-LOC rule).

## Part 2 — Accent-tinted icon on the active file

### Scope

- Applies only to `.file-tree-row--active .file-tree-icon` — the file open in the editor.
- Hover and keyboard-selected rows stay monochrome (current opacity stepping unchanged).
- Folder glyphs and chevrons are `currentColor` inline SVGs without the `.file-tree-icon`
  class — untouched.

### Technique

Devicon file icons are inline multi-color SVGs; a mask would flatten them to silhouettes.
Instead, tint via a CSS filter chain that preserves internal luminance detail (e.g. the TS
lettermark stays visible as lighter-accent-on-darker-accent):

```
grayscale(1) sepia(1) hue-rotate(<H>deg) saturate(<S>) brightness(<B>) opacity(1)
```

`sepia(1)` lands grays at hue ≈ 40° / saturation ≈ 45%; rotating by `accentHue − 40°` lands
on the theme accent.

### Theme-agnostic token

`src/shared/themes/adapter.ts` computes a new token from the theme accent (same pattern as
`--shadow-glow`):

- `--tree-icon-active-filter: grayscale(1) sepia(1) hue-rotate(${accentHue - 40}deg)
  saturate(${clamp(accentSat / 0.45, 0.4, 3)}) brightness(1.08) opacity(1)`, where
  `accentHue` is the accent's HSL hue in degrees and `accentSat` its HSL saturation as a
  0–1 fraction.
- Exact saturate/brightness factors are tuned during implementation against Royal Dark and at
  least one light theme; the formula above is the starting point.

`theme.css`:

```css
.file-tree-row.file-tree-row--active .file-tree-icon {
  filter: var(--tree-icon-active-filter, grayscale(1) brightness(1.08) opacity(1));
}
```

The fallback preserves today's monochrome behavior if the token is missing. No
theme-conditional logic; all 32+ themes derive their own tint.

## Error handling

No new error paths. Existing `createError` rendering and clone-failure handling keep their
current behavior and placement.

## Testing

- **`NoProjectActions.test.tsx`** (update): pill switches placeholder; CTA disabled when
  textarea empty / enabled with text; submit passes `projectKind: 'folder'` only in
  copied-instructions mode; success clears the textarea; clone flow unchanged.
- **Adapter**: if adapter has an existing test file, add a case asserting
  `--tree-icon-active-filter` is emitted and varies with accent hue.
- **Baseline first**: run the existing suite before changes (typecheck:web baseline is 37
  errors, not zero).
- **Manual verify**: run the app; check the project view against the agent view side by side,
  and the active-file icon tint in Royal Dark + one light theme.

## Documentation

Per the docs wiki rule, the implementation PR updates the `docs/architecture/` page(s) whose
`covers:` paths include `src/renderer/components/sidebar/`, `src/renderer/styles/theme.css`,
and `src/shared/themes/adapter.ts` (exact pages identified from the doc map during planning),
bumping `updated:`.

## Out of scope

- Any change to `NewAgentForm` / `OnboardingView` hero (already in the target state).
- Recoloring hover/selected tree rows or folder glyphs.
- New themes or theme JSON changes.
