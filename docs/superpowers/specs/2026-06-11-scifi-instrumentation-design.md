# Sci-fi instrumentation for the themes — design

**Date:** 2026-06-11
**Status:** Approved (brainstormed via visual companion; user selected elements from live mockups)

## Intent

Build on the premium/luxury design language (#638–#641) with a layer of *instrument-grade
starship* details — sci-fi that reads as a very expensive ship's bridge, not neon cyberpunk.
Five elements, **whisper intensity** (faint, slow, discovered over time), applied to **all
themes** via token derivation so each theme renders them in its own metal (Royal gold, Neon
lime, Manifold bronze, …).

User selections from the mockup board: reticle focus, chamfered corners, sensor sweep,
warp-core pulse, starfield horizon. Explicitly rejected: HUD telemetry status bar,
calibration tick rulers.

## Elements

### A · Targeting-reticle focus
- The **global** `input:focus` / `textarea:focus` treatment (`theme.css:356`) gains
  **four accent corner brackets** in place of the plain accent border (chat prompt,
  start-project textarea, rename fields — every text field, by selector). `select:focus`
  keeps the current border-only treatment.
- Implementation: layered `background-image` linear-gradients pinned to the four corners
  (two thin bars per corner, ~12px legs, ~1.5px stroke in `var(--accent)`), no DOM changes.
- Buttons and `[role='button']` keep the existing focus-visible ring unchanged.
- The brackets are the focus indicator — state, not decoration ("earn every pixel").

### B · Chamfered panel corners
- `clip-path` polygon cuts the **top-left and bottom-right** corners at 45° (~10px notch)
  on exactly two elements:
  - `.btn-metal` (primary CTA — Start Agent, + New Agent, Start Project)
  - the workspace badge (`theme.css` ≈707, the accent-bordered workspace card)
- Nothing else is chamfered at whisper level; the cut marks top-hierarchy elements only.
- The existing metal-gradient borders/sheen are preserved inside the clipped silhouette.

### C · Sensor sweep on running agents
- The sidebar agent row already receives `isOutputting` (`AgentItem.tsx:134`, currently
  drives only the dot). A new modifier class `sidebar-agent-row--outputting` is applied
  alongside, adding a slow **~3.2s** light band (≈90px wide, `var(--effect-glow)`) sweeping
  left→right across the row, with a pause between passes.
- Implemented with an `::after` overlay + keyframes; `pointer-events: none`.
- Stops the moment the agent idles (class removal). Disabled under
  `prefers-reduced-motion`.

### D · Warp-core pulse
- `.status-dot--active` currently blinks via `dot-blink` (opacity, 1.4s — `theme.css:381`).
  Replace the blink **in place** with a breathing **2.4s** glow halo (`box-shadow` in
  `var(--effect-glow)`, two radii); the dot itself stays `var(--accent)` at full opacity.
- Same class, no markup changes. `prefers-reduced-motion`: static dot, no animation.
- `dot-blink` keyframes are removed if nothing else references them.

### E · Starfield + horizon grid
- New shared component `StarfieldBackdrop.tsx` (renderer/components): an absolutely
  positioned, `aria-hidden`, `pointer-events: none` backdrop with
  - ~15 **static** stars (no twinkle) as radial-gradient dots in `var(--star-tint)` with a
    few `--accent-hi`-tinted outliers, and
  - a perspective-transformed grid (`var(--grid-tint)`) fading to nothing at a horizon line
    via mask-image.
- Rendered behind the `ManifoldGhost` in its two homes: `OnboardingView` and the empty
  `AgentChatView`. No other placements.

## Tokens & theming

Three new tokens derived per theme in `src/shared/themes/adapter.ts` (following the
`--accent-hi` / `--tree-icon-active-filter` pattern), consumed in `theme.css` with
fallbacks so absent tokens degrade gracefully:

| Token | Derivation | Purpose |
|---|---|---|
| `--effect-glow` | accent at `isDark ? ~0.16 : ~0.10` alpha | sweep band + pulse halo |
| `--star-tint` | foreground/accent mix, very low alpha; ink-on-paper (darker, lower alpha) on light themes | starfield dots |
| `--grid-tint` | accent-leaning mix at lower alpha than `--star-tint` | horizon grid lines |

Everything else uses existing tokens (`--accent`, `--accent-hi`, `--accent-subtle`) and
`color-mix()`. **No theme-conditional logic anywhere** — structure is identical across all
themes; only token values vary (design-system rule 4). All 8 theme JSONs inherit the
elements automatically.

## Accessibility

- `prefers-reduced-motion: reduce` disables the sweep and pulse animations (static dot
  remains as the running indicator).
- Reticle brackets preserve focus visibility at equal-or-better contrast than the ring
  they replace.
- Starfield is `aria-hidden` decoration behind existing content.

## Testing

- **Adapter (TDD):** token-derivation assertions for a dark + a light theme (mirroring the
  existing `--accent-hi` and `--tree-icon-active-filter` tests in `adapter.test.ts`).
- **AgentItem (TDD):** `isOutputting` toggles `sidebar-agent-row--outputting`.
- **StarfieldBackdrop (TDD):** renders stars + grid layers, `aria-hidden`; integration
  assertions in `OnboardingView` / `AgentChatView` tests.
- **Visual proof:** built-app Playwright driver probing computed styles — `clip-path` on
  `.btn-metal`, running animation on an outputting row, corner-bracket background on the
  focused prompt — in Royal Dark and one light theme.
- Suites/typecheck at baseline per project conventions.

## Delivery

Two stacked PRs in the established design-PR style:

1. **Instrument metalwork & motion** — adapter tokens + all pure-CSS elements (A–D),
   `AgentItem` class wiring.
2. **Starfield horizon** — `StarfieldBackdrop` + the two integrations.

## Out of scope

- HUD telemetry status bar and calibration tick rulers (rejected in selection).
- Reticle on dockview panels or buttons; chamfers beyond the two named elements.
- Any starfield animation (twinkle/parallax); sweep on tabs or panel headers.
- New themes or theme JSON changes.
