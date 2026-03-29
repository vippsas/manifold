# Design Skill Specification

**Date:** 2026-03-29
**Location:** `.claude/skills/design/SKILL.md`
**Type:** Hybrid — Philosophy + Actionable Patterns

## Purpose

A Claude Code skill that captures Manifold's design system philosophy, principles, and patterns so that all future UI/styling work follows a consistent visual identity. The skill teaches *how to think about design in this codebase* rather than duplicating token values.

## Trigger

Activates when the task involves UI components, styling, theming, visual design, layout, or any modification to `*.styles.ts`, `theme.css`, or component appearance.

## Structure (7 sections)

### 1. Frontmatter

```yaml
name: design
description: Manifold design system — philosophy, principles, and patterns for UI work
```

Trigger condition: any UI, styling, or component work in the Manifold codebase.

### 2. Design Philosophy: Jacob & Co Luxury Aesthetic

Four pillars that define the visual identity:

- **Near-Black Canvas** — The deepest dark (#0A0A0E) creates depth and prestige. Accent colors pop against it. The darkness is the canvas, not the absence of design.
- **Dual Metal Accents** — Rose gold (#C9906D) for interactive elements, white gold (#E6B422) for highlights and emphasis. Warm metals on cold black.
- **Polished Metal Shadows** — 3-tier shadow system (subtle → popover → overlay) with `inset 0 1px 0 rgba(255,255,255,0.03)` top-highlight that mimics brushed metal.
- **Gemstone Status Colors** — Running = turquoise, waiting = amber, done = emerald, error = ruby. Precious-stone inspired, not generic.

### 3. Core Principles (5 rules)

1. **Token-Only Colors** — Never hardcode hex/rgb in component styles. Always `var(--token)`. Check existing tokens before creating new ones.
2. **3-Tier Surface Hierarchy** — primary (deepest, content) → secondary/chrome (headers, tabs) → elevated/overlay (popovers, modals). Never place deeper surfaces above shallower ones.
3. **Consistent Interaction Language** — Every interactive element: `base → hover (150ms) → active → focus-visible (accent ring)`. Transitions 150-200ms ease.
4. **Theme-Agnostic Structure** — Shadows, gradients, spacing, radius apply universally across all 32+ themes. Theme JSON only controls color palette.
5. **Earn Every Pixel** — No decorative elements without purpose. Gradients = interactivity. Shadows = elevation. Borders = separation. Remove anything that doesn't communicate state or structure.

### 4. Token Reference Map

Points to `src/renderer/styles/theme.css` as source of truth. Categories:

| Category | Token Prefix | Examples |
|----------|-------------|----------|
| Surfaces | `--bg-*` | primary, secondary, sidebar, input, chrome, elevated, overlay |
| Text | `--text-*` | primary, secondary, muted |
| Accent | `--accent*` | accent, accent-hover, accent-dim, accent-subtle, accent-text |
| Status | `--status-*` | running, waiting, done, error |
| Boundaries | `--border`, `--divider` | border, divider, control-border, control-bg-hover |
| Shadows | `--shadow-*` | subtle, popover, overlay, elevated |
| Spacing | `--space-*` | xs (4), sm (8), md (14), lg (18), xl (28) |
| Radius | `--radius-*` | xs (2), sm (5), md (8), lg (10), pill (999) |
| Typography | `--font-*`, `--type-*` | font-sans, font-mono, type-ui (13), type-ui-small (12), type-ui-caption (11), type-ui-micro (10) |

### 5. Actionable Patterns (7 recipes)

Each recipe includes a brief code snippet showing the correct pattern:

1. **New Component Style File** — Create `ComponentName.styles.ts` co-located with component. Export `Record<string, React.CSSProperties>`. Reference tokens via `var(--token)`. Follow naming: wrapper, header, content, footer.

2. **Button Variants** — Primary: gradient background + `filter: brightness(1.12)` on hover. Secondary: `--control-bg` + `--control-border`. Both: 200ms transition, `--radius-sm`, `--control-height`.

3. **Hover / Focus / Active States** — Hover: `--list-hover-bg` + text to `--text-primary`. Focus-visible: `box-shadow: 0 0 0 2px var(--accent-subtle)`. Active: `--sidebar-active-bg`. Transition: 150ms ease.

4. **Modal / Dialog** — Reuse primitives from `workbench-style-primitives.ts`. Overlay: `backdropFilter: blur(12px)`. Panel: `--bg-overlay` + `--shadow-overlay` + `--radius-md`. Header/footer: `--bg-chrome` with border separators.

5. **Status Indicators** — Dot: 8px circle with `--status-{state}`. Border-left: 2px solid on list items. Badge: `--accent-subtle` bg + `--accent` text + `--radius-xs`.

6. **Cards & Elevated Content** — `--bg-elevated` + `1px solid var(--border)` + `--radius-sm` + `--shadow-elevated`. Hover lift: `translateY(-0.5px)` + shadow promotion.

7. **Animations** — Transitions: 150ms ease (hover), 200ms ease (structural). Existing keyframes: `spin`, `shimmer`, `toast-slide-up`. New animations must match these durations — restrained, functional.

### 6. Anti-Patterns

1. **Hardcoded Colors** — Never `color: '#ffffff'`. Always `color: 'var(--text-primary)'`.
2. **Inventing New Tokens** — Check theme.css first. Token vocabulary is intentionally small. Adding tokens adds maintenance across 32+ themes.
3. **CSS Modules / Styled Components** — Codebase uses `*.styles.ts` with `React.CSSProperties`. Don't introduce CSS modules, styled-components, emotion, or other CSS-in-JS.
4. **Breaking Surface Hierarchy** — Never use `--bg-primary` for elevated elements. Elevated content must use `--bg-elevated` or `--bg-overlay`.
5. **Gratuitous Animation** — No bouncing, spring physics, or entrance animations beyond `toast-slide-up`. Luxury means restraint.
6. **Theme-Specific Structural Code** — Never `if (theme === 'jacob-co-dark')`. Structural styling works identically across all themes.

### 7. File Reference

| File | Purpose |
|------|---------|
| `src/renderer/styles/theme.css` | Source of truth — all tokens, keyframes, layout utilities |
| `src/renderer/components/*.styles.ts` | Component style patterns to follow |
| `src/renderer/components/workbench-style-primitives.ts` | Shared dialog/popover/overlay styles |
| `src/shared/themes/adapter.ts` | Theme color derivation (accent-hover, accent-dim, etc.) |
| `src/renderer/styles/dockview-theme.css` | Dockview panel library token mapping |
| `src/shared/themes/data/*.json` | Theme color palettes (Monaco JSON format) |
