---
name: design
description: Manifold design system — philosophy, principles, and patterns for UI work. Use when creating or modifying UI components, styling, theming, layout, or any visual aspect of the application.
---

# Manifold Design System

Use this skill when working on UI components, styling, theming, visual design, layout, or any modification to `*.styles.ts`, `theme.css`, or component appearance.

## Design Philosophy: Jacob & Co Luxury Aesthetic

Four pillars define the visual identity:

**Near-Black Canvas.** The deepest dark creates depth and prestige. Accent colors pop against it. The darkness is the canvas, not the absence of design.

**Dual Metal Accents.** Rose gold for interactive elements, white gold for highlights and emphasis. Warm metals on cold black — sophistication through contrast.

**Polished Metal Shadows.** 3-tier shadow system (subtle → popover → overlay). Each level includes an `inset 0 1px 0 rgba(255,255,255,0.03)` top-highlight that mimics brushed metal.

**Gemstone Status Colors.** Running = turquoise, waiting = amber, done = emerald, error = ruby. Precious-stone inspired, not generic.

## Core Principles

### 1. Token-Only Colors

Never hardcode hex/rgb values in component styles. Always use `var(--token-name)`. If a token doesn't exist for your use case, check `src/renderer/styles/theme.css` for an existing one that fits before creating a new one.

```typescript
// WRONG
color: '#ffffff',
background: '#282a36',

// CORRECT
color: 'var(--text-primary)',
background: 'var(--bg-primary)',
```

### 2. 3-Tier Surface Hierarchy

Surfaces layer in three depths:

- **Primary** (deepest) — content areas, editor background (`--bg-primary`)
- **Secondary / Chrome** — headers, tab bars, status bar (`--bg-secondary`, `--bg-chrome`)
- **Elevated / Overlay** — popovers, modals, dropdowns (`--bg-elevated`, `--bg-overlay`)

Never place a deeper surface above a shallower one. An elevated element must use `--bg-elevated` or `--bg-overlay`, never `--bg-primary`.

### 3. Consistent Interaction Language

Every interactive element follows the same pattern:

```
base → hover (150ms ease) → active → focus-visible (accent ring)
```

- **Hover:** `background: var(--list-hover-bg)`, promote text to `var(--text-primary)`
- **Active:** `background: var(--sidebar-active-bg)`
- **Focus-visible:** `box-shadow: 0 0 0 2px var(--accent-subtle), 0 0 10px var(--accent-subtle)`
- **Transitions:** 150ms ease for hover states, 200ms ease for structural changes

### 4. Theme-Agnostic Structure

Shadows, gradients, spacing, border-radius, and layout are structural — they apply identically across all 32+ themes. Theme JSON only controls the color palette. Never tie structural improvements to a specific theme. Never write `if (theme === 'jacob-co-dark') { ... }`.

### 5. Earn Every Pixel

No decorative elements without purpose:

- Gradients indicate interactivity (buttons) or hierarchy (headers)
- Shadows indicate elevation
- Borders indicate separation
- If a visual element doesn't communicate state or structure, remove it

## Token Reference

Source of truth: `src/renderer/styles/theme.css`

| Category | Token Prefix | Examples |
|----------|-------------|----------|
| Surfaces | `--bg-*` | primary, secondary, sidebar, input, chrome, elevated, overlay |
| Text | `--text-*` | primary, secondary, muted |
| Accent | `--accent*` | accent, accent-hover, accent-dim, accent-subtle, accent-text |
| Status | `--status-*` | running, waiting, done, error |
| Boundaries | `--border`, `--divider` | border, divider, control-border, control-bg-hover |
| Shadows | `--shadow-*` | subtle, popover, overlay, elevated |
| Spacing | `--space-*` | xs (4px), sm (8px), md (14px), lg (18px), xl (28px) |
| Radius | `--radius-*` | xs (2px), sm (5px), md (8px), lg (10px), pill (999px) |
| Typography | `--font-*`, `--type-*` | font-sans, font-mono, type-ui (13px), type-ui-small (12px), type-ui-caption (11px), type-ui-micro (10px) |

Read `theme.css` for current values. Don't memorize them — they evolve with the design.

## Patterns

### New Component Style File

Create `ComponentName.styles.ts` co-located with the component:

```typescript
export const myComponentStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--bg-primary)',
  },
  header: {
    padding: 'var(--space-xs) var(--space-sm)',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-chrome)',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-sm)',
  },
}
```

### Button Variants

**Primary** — gradient background with brightness filter on hover:

```typescript
primaryButton: {
  background: 'linear-gradient(135deg, var(--btn-bg), var(--btn-hover))',
  color: 'var(--btn-text)',
  height: 'var(--control-height)',
  borderRadius: 'var(--radius-sm)',
  transition: 'filter 200ms ease',
}
// hover: filter: 'brightness(1.12)'
```

**Secondary** — subtle background with border:

```typescript
secondaryButton: {
  background: 'var(--control-bg)',
  border: '1px solid var(--control-border)',
  color: 'var(--text-secondary)',
  height: 'var(--control-height)',
  borderRadius: 'var(--radius-sm)',
  transition: 'background 200ms ease, color 200ms ease',
}
// hover: color: 'var(--text-primary)'
```

### Hover / Focus / Active States

```typescript
item: {
  color: 'var(--text-secondary)',
  transition: 'background 150ms ease, color 150ms ease',
}
// hover:
{
  background: 'var(--list-hover-bg)',
  color: 'var(--text-primary)',
}
// active:
{
  background: 'var(--sidebar-active-bg)',
  color: 'var(--text-primary)',
  boxShadow: 'inset 0 0 0 1px var(--sidebar-active-border)',
}
// focus-visible:
{
  outline: 'none',
  boxShadow: '0 0 0 2px var(--accent-subtle), 0 0 10px var(--accent-subtle)',
}
```

### Modal / Dialog

Reuse primitives from `workbench-style-primitives.ts`:

```typescript
overlay: {
  background: 'var(--overlay-backdrop)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  zIndex: 1000,
}
panel: {
  background: 'var(--bg-overlay)',
  border: '1px solid var(--overlay-border)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-overlay)',
}
header: {
  minHeight: 'var(--dialog-header-height)',
  background: 'var(--bg-chrome)',
  borderBottom: '1px solid var(--border)',
}
footer: {
  background: 'var(--bg-chrome)',
  borderTop: '1px solid var(--border)',
  justifyContent: 'flex-end',
  gap: 'var(--space-sm)',
}
```

### Status Indicators

**Dot** — 8px circle:

```typescript
statusDot: {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--status-running)', // or waiting, done, error
  flexShrink: 0,
}
```

**Border-left** — on list items:

```typescript
agentRow: {
  borderLeft: '2px solid var(--status-running)',
  // changes per status: --status-waiting, --status-done, --status-error
}
```

**Badge** — small label:

```typescript
badge: {
  background: 'var(--accent-subtle)',
  color: 'var(--accent)',
  padding: '1px 6px',
  borderRadius: 'var(--radius-xs)',
  fontSize: 'var(--type-ui-caption)',
}
```

### Cards & Elevated Content

```typescript
card: {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  boxShadow: 'var(--shadow-elevated)',
  padding: 'var(--space-sm)',
  transition: 'transform 0.2s, box-shadow 0.2s',
}
// hover:
{
  transform: 'translateY(-0.5px)',
  boxShadow: 'var(--shadow-popover)',
}
```

### Animations

Existing keyframes in `theme.css` — reuse these, don't invent new ones:

- `spin` — 0.6s linear infinite (loading spinners)
- `shimmer` — skeleton loaders
- `toast-slide-up` — notification entrance

Timing conventions:
- **Hover transitions:** 150ms ease
- **Structural transitions:** 200ms ease
- **Chevron/expand:** 0.1s ease

New animations must feel restrained. Luxury means restraint, not spectacle. No bouncing, no spring physics, no gratuitous entrance animations.

## Anti-Patterns

| Don't | Do Instead |
|-------|-----------|
| Hardcode hex/rgb in styles | Use `var(--token-name)` |
| Create new CSS tokens without checking | Search `theme.css` for existing tokens first |
| Use CSS modules, styled-components, emotion | Use `*.styles.ts` with `React.CSSProperties` |
| Use `--bg-primary` for elevated elements | Use `--bg-elevated` or `--bg-overlay` |
| Add bouncy/spring/entrance animations | Use 150-200ms ease transitions |
| Write theme-conditional logic | Make structural styling theme-agnostic |

## File Reference

| File | Read When |
|------|-----------|
| `src/renderer/styles/theme.css` | Starting any UI work — source of truth for all tokens |
| `src/renderer/components/*.styles.ts` | Creating a new component — follow the established pattern |
| `src/renderer/components/workbench-style-primitives.ts` | Building modals, dialogs, popovers |
| `src/shared/themes/adapter.ts` | Understanding how theme colors are derived |
| `src/renderer/styles/dockview-theme.css` | Working with the panel/tab system |
| `src/shared/themes/data/*.json` | Adding or modifying themes |
