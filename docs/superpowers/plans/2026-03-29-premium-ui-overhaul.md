# Premium UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Manifold's UI from functional developer tool to premium product experience with two theme variants, user-controlled density, and refined interactions.

**Architecture:** Three-phase rollout. Phase 1 adds new CSS tokens and density infrastructure (no visual changes to existing themes). Phase 2 introduces two new premium themes, ghost buttons, and tab indicators. Phase 3 redesigns sidebar hierarchy, welcome/new-agent screens, and removes structural borders. Each phase is one PR.

**Tech Stack:** CSS custom properties, React inline styles (*.styles.ts pattern), Electron IPC for settings, Monaco theme JSON format.

**Spec:** `docs/superpowers/specs/2026-03-29-premium-ui-overhaul-design.md`

---

## File Structure

### Phase 1 — New/Modified Files
| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/renderer/styles/theme.css` | Add duration, easing, spacing, typography, shadow tokens + density CSS classes |
| Modify | `src/shared/types.ts` | Add `density` property to ManifoldSettings |
| Modify | `src/shared/defaults.ts` | Set density default to `'comfortable'` |
| Modify | `src/renderer/App.tsx` | Apply density CSS class to root element |
| Modify | `src/renderer/styles/dockview-theme.css` | Use token-based tab height |

### Phase 2 — New/Modified Files
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/shared/themes/data/Manifold Mission Control.json` | Mission Control Monaco theme colors |
| Create | `src/shared/themes/data/Manifold Atelier.json` | Atelier Monaco theme colors |
| Modify | `src/shared/themes/theme-data.ts` | Register new themes in theme list |
| Modify | `src/shared/themes/adapter.ts` | Add surface tinting + shadow glow generation |
| Modify | `src/renderer/components/workbench-style-primitives.ts` | Add ghost button + tertiary button styles |
| Modify | `src/renderer/components/modals/settings/GeneralSettingsSection.tsx` | Add density selector to Appearance section |
| Modify | `src/renderer/styles/dockview-theme.css` | Hide tab close button until hover |

### Phase 3 — New/Modified Files
| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/renderer/components/modals/OnboardingView.tsx` | Replace ASCII logo with SVG wordmark |
| Modify | `src/renderer/components/modals/NewAgentForm.tsx` | Redesign branch toggle + standalone Start button |
| Modify | `src/renderer/components/modals/WelcomeDialog.tsx` | Ghost buttons, spacing, SVG logo |
| Modify | `src/renderer/components/sidebar/ProjectSidebar.tsx` | Three-tier project hierarchy |
| Modify | `src/renderer/components/sidebar/ProjectSidebar.styles.ts` | Sidebar zone styling, section labels |
| Modify | `src/renderer/components/git/StatusBar.tsx` | Zone background class |
| Modify | `src/renderer/styles/theme.css` | Zone CSS variables, border removals |

---

## Phase 1: Foundation

### Task 1: Add Duration & Easing Tokens to theme.css

**Files:**
- Modify: `src/renderer/styles/theme.css:4-105` (inside `:root` block)

- [ ] **Step 1: Add duration tokens after line 33 (after status-bar-height)**

Add these lines inside the `:root` block in `src/renderer/styles/theme.css`, after the `--status-bar-height` line (line 33):

```css
  /* Duration tokens */
  --duration-fast: 100ms;
  --duration-normal: 250ms;
  --duration-slow: 400ms;
  --duration-elegant: 600ms;

  /* Easing tokens */
  --ease-out: cubic-bezier(0.0, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-premium: cubic-bezier(0.4, 0, 0.2, 1);
```

- [ ] **Step 2: Verify the app still loads**

Run: `npm run typecheck`
Expected: PASS (CSS-only change, no TS impact)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "feat: add duration and easing CSS tokens for premium timing system"
```

---

### Task 2: Add Spacing, Typography & Shadow Tokens to theme.css

**Files:**
- Modify: `src/renderer/styles/theme.css:4-105` (inside `:root` block)

- [ ] **Step 1: Add new spacing tokens after `--space-xl` (line 18)**

```css
  --space-2xl: 40px;
  --space-3xl: 56px;
  --space-4xl: 80px;
```

- [ ] **Step 2: Change `--space-lg` value from 18px to 20px (line 17)**

```css
  --space-lg: 20px;
```

- [ ] **Step 3: Add typography tokens after `--type-ui-micro` (line 23)**

```css
  /* Extended type scale */
  --type-display: 24px;
  --type-title: 18px;
  --type-heading: 15px;
  --type-label: 11px;

  /* Letter-spacing tokens */
  --tracking-tight: -0.01em;
  --tracking-normal: 0em;
  --tracking-wide: 0.1em;
```

- [ ] **Step 4: Add `--row-gap` token after `--control-height` (line 28)**

```css
  --row-gap: 4px;
```

- [ ] **Step 5: Update shadow tokens (lines 101-104)**

Replace the existing shadow token block:

```css
  --shadow-subtle: 0 2px 8px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  --shadow-popover: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  --shadow-overlay: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  --shadow-elevated: 0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06);
```

- [ ] **Step 6: Verify the app still loads**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "feat: add spacing, typography, letter-spacing, and enhanced shadow tokens"
```

---

### Task 3: Add Density Setting to Type System

**Files:**
- Modify: `src/shared/types.ts:51-65`
- Modify: `src/shared/defaults.ts:3-41`

- [ ] **Step 1: Add Density type and property to ManifoldSettings**

In `src/shared/types.ts`, add a type alias before the `ManifoldSettings` interface (before line 51):

```typescript
export type DensitySetting = 'compact' | 'comfortable' | 'spacious'
```

Then add the property inside `ManifoldSettings` (after the `uiMode` line, line 61):

```typescript
  density: DensitySetting
```

- [ ] **Step 2: Add density default**

In `src/shared/defaults.ts`, add inside `DEFAULT_SETTINGS` (after the `uiMode` line, line 13):

```typescript
  density: 'comfortable' as const,
```

- [ ] **Step 3: Run typecheck to find any issues**

Run: `npm run typecheck`
Expected: PASS — the settings store uses `Partial<ManifoldSettings>` for updates and merges with defaults, so the new property flows through automatically.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/shared/defaults.ts
git commit -m "feat: add density setting type (compact/comfortable/spacious)"
```

---

### Task 4: Add Density CSS Classes to theme.css

**Files:**
- Modify: `src/renderer/styles/theme.css` (add after `:root` block, before first CSS rule)

- [ ] **Step 1: Add density override classes**

Add these class definitions after the `:root` closing brace (after line ~105, adjusting for prior insertions):

```css
/* ── Density presets ── */
.density-compact {
  --chrome-tab-height: 28px;
  --chrome-row-height: 24px;
  --chrome-status-height: 22px;
  --control-height: 26px;
  --row-gap: 2px;
  --space-lg: 18px;
}

.density-spacious {
  --chrome-tab-height: 40px;
  --chrome-row-height: 38px;
  --chrome-status-height: 28px;
  --control-height: 36px;
  --row-gap: 8px;
  --space-lg: 24px;
  --space-xl: 32px;
}
```

Note: "comfortable" is the default (`:root` values), so no class is needed for it.

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "feat: add density-compact and density-spacious CSS class overrides"
```

---

### Task 5: Apply Density Class to Root Element

**Files:**
- Modify: `src/renderer/App.tsx:97,233-253`

- [ ] **Step 1: Derive density class from settings**

In `src/renderer/App.tsx`, find where `themeClass` is used (around line 97). Near where `themeClass` is derived, add a density class computation. Find the `settings` destructure from `useSettings()` and add:

```typescript
const densityClass = settings.density === 'comfortable' ? '' : `density-${settings.density}`
```

- [ ] **Step 2: Add density class to all root div elements**

The file has three return paths (lines ~233, ~242, ~252), each with `className={\`layout-root ${themeClass}\`}`. Update all three to:

```typescript
className={`layout-root ${themeClass} ${densityClass}`}
```

- [ ] **Step 3: Verify typecheck and test**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: apply density CSS class to root element from settings"
```

---

### Task 6: Update Existing Transitions to Use New Tokens

**Files:**
- Modify: `src/renderer/styles/theme.css` (multiple locations)
- Modify: `src/renderer/styles/dockview-theme.css`

- [ ] **Step 1: Search for hardcoded transition values in theme.css**

Look for all `transition:` and `0.15s` or `150ms` or `0.6s` or `200ms` patterns in `src/renderer/styles/theme.css`. Replace them with the new tokens:

- `0.15s ease` / `150ms ease` → `var(--duration-normal) var(--ease-premium)`
- `200ms ease` → `var(--duration-normal) var(--ease-premium)`
- `0.1s ease` → `var(--duration-fast) var(--ease-premium)`

Note: Keep `@keyframes spin` animation at `0.6s linear` — spinners should stay mechanical.

- [ ] **Step 2: Update dockview-theme.css sash transition**

In `src/renderer/styles/dockview-theme.css`, find the sash hover transition (around line 30) and update:

```css
transition: background var(--duration-normal) var(--ease-premium);
```

- [ ] **Step 3: Add micro-interaction styles to theme.css**

Add a utility section for micro-interactions (after the density classes):

```css
/* ── Micro-interactions ── */
button:active,
[role="button"]:active {
  transform: scale(0.97);
  transition: transform var(--duration-fast) var(--ease-out);
}
```

- [ ] **Step 4: Verify the app loads and interactions feel different**

Run: `npm run typecheck`
Expected: PASS

Start the app with `npm run dev` and verify:
- Hover transitions on sidebar items feel slower and smoother
- Button press has a subtle scale-down
- Divider hover transitions feel deliberate

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/theme.css src/renderer/styles/dockview-theme.css
git commit -m "feat: migrate hardcoded transitions to duration/easing tokens, add button press micro-interaction"
```

---

## Phase 2: Visual Identity

### Task 7: Create Mission Control Theme JSON

**Files:**
- Create: `src/shared/themes/data/Manifold Mission Control.json`

- [ ] **Step 1: Create the theme file**

Create `src/shared/themes/data/Manifold Mission Control.json`:

```json
{
  "base": "vs-dark",
  "inherit": true,
  "rules": [
    { "token": "comment", "foreground": "546e7a", "fontStyle": "italic" },
    { "token": "keyword", "foreground": "7c4dff" },
    { "token": "string", "foreground": "69f0ae" },
    { "token": "number", "foreground": "f0c060" },
    { "token": "type", "foreground": "4fc3f7" },
    { "token": "function", "foreground": "b0bec5" },
    { "token": "variable", "foreground": "e0e8f0" },
    { "token": "operator", "foreground": "78909c" },
    { "token": "constant", "foreground": "f0c060" },
    { "token": "tag", "foreground": "4fc3f7" },
    { "token": "attribute.name", "foreground": "7c4dff" },
    { "token": "attribute.value", "foreground": "69f0ae" },
    { "token": "delimiter", "foreground": "607d8b" }
  ],
  "colors": {
    "editor.foreground": "#e0e8f0",
    "editor.background": "#0a0a12",
    "editor.selectionBackground": "#4fc3f720",
    "editor.lineHighlightBackground": "#4fc3f708",
    "editorCursor.foreground": "#4fc3f7",
    "editorWhitespace.foreground": "#1a1a2a",
    "editorLineNumber.foreground": "#2a2a3a",
    "editorLineNumber.activeForeground": "#546e7a",
    "editorGroupHeader.tabsBackground": "#08080e",
    "tab.activeBackground": "#0e0e18",
    "tab.inactiveBackground": "#08080e",
    "tab.activeForeground": "#e0e8f0",
    "tab.inactiveForeground": "#546e7a",
    "tab.border": "#4fc3f70a",
    "sideBar.background": "#06060c",
    "sideBar.foreground": "#b0bec5",
    "sideBarSectionHeader.background": "#0e0e1a",
    "list.activeSelectionBackground": "#4fc3f715",
    "list.activeSelectionForeground": "#e0e8f0",
    "list.hoverBackground": "#4fc3f70a",
    "list.focusBackground": "#4fc3f712",
    "input.background": "#0e0e18",
    "input.foreground": "#e0e8f0",
    "input.border": "#4fc3f71a",
    "input.placeholderForeground": "#37474f",
    "focusBorder": "#4fc3f7",
    "button.background": "#4fc3f7",
    "button.foreground": "#0a0a12",
    "button.hoverBackground": "#3aa3d4",
    "badge.background": "#4fc3f730",
    "badge.foreground": "#4fc3f7",
    "titleBar.activeBackground": "#06060c",
    "titleBar.activeForeground": "#b0bec5",
    "statusBar.background": "#04040a",
    "statusBar.foreground": "#546e7a",
    "menu.background": "#0e0e1a",
    "menu.foreground": "#b0bec5",
    "editorWidget.background": "#0c0c16",
    "editorWidget.border": "#4fc3f710",
    "terminal.foreground": "#b0bec5",
    "terminal.ansiBlack": "#0a0a12",
    "terminal.ansiRed": "#e57373",
    "terminal.ansiGreen": "#69f0ae",
    "terminal.ansiYellow": "#f0c060",
    "terminal.ansiBlue": "#4fc3f7",
    "terminal.ansiMagenta": "#7c4dff",
    "terminal.ansiCyan": "#4dd0b6",
    "terminal.ansiWhite": "#e0e8f0",
    "terminal.ansiBrightBlack": "#37474f",
    "terminal.ansiBrightRed": "#ef9a9a",
    "terminal.ansiBrightGreen": "#a5d6a7",
    "terminal.ansiBrightYellow": "#ffe082",
    "terminal.ansiBrightBlue": "#81d4fa",
    "terminal.ansiBrightMagenta": "#b388ff",
    "terminal.ansiBrightCyan": "#80deea",
    "terminal.ansiBrightWhite": "#f5f5f5"
  }
}
```

- [ ] **Step 2: Verify the JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/shared/themes/data/Manifold Mission Control.json', 'utf8')); console.log('Valid JSON')"`
Expected: `Valid JSON`

- [ ] **Step 3: Commit**

```bash
git add "src/shared/themes/data/Manifold Mission Control.json"
git commit -m "feat: add Manifold Mission Control theme"
```

---

### Task 8: Create Atelier Theme JSON

**Files:**
- Create: `src/shared/themes/data/Manifold Atelier.json`

- [ ] **Step 1: Create the theme file**

Create `src/shared/themes/data/Manifold Atelier.json`:

```json
{
  "base": "vs-dark",
  "inherit": true,
  "rules": [
    { "token": "comment", "foreground": "8d6e63", "fontStyle": "italic" },
    { "token": "keyword", "foreground": "c9a06d" },
    { "token": "string", "foreground": "a5d6a7" },
    { "token": "number", "foreground": "f0c060" },
    { "token": "type", "foreground": "bcaaa4" },
    { "token": "function", "foreground": "e8e0d4" },
    { "token": "variable", "foreground": "e8e0d4" },
    { "token": "operator", "foreground": "a1887f" },
    { "token": "constant", "foreground": "f0c060" },
    { "token": "tag", "foreground": "c9a06d" },
    { "token": "attribute.name", "foreground": "a1887f" },
    { "token": "attribute.value", "foreground": "a5d6a7" },
    { "token": "delimiter", "foreground": "795548" }
  ],
  "colors": {
    "editor.foreground": "#e8e0d4",
    "editor.background": "#0d0b0a",
    "editor.selectionBackground": "#c9a06d20",
    "editor.lineHighlightBackground": "#c9a06d08",
    "editorCursor.foreground": "#c9a06d",
    "editorWhitespace.foreground": "#1a1614",
    "editorLineNumber.foreground": "#2a2420",
    "editorLineNumber.activeForeground": "#8d6e63",
    "editorGroupHeader.tabsBackground": "#0a0908",
    "tab.activeBackground": "#141210",
    "tab.inactiveBackground": "#0a0908",
    "tab.activeForeground": "#e8e0d4",
    "tab.inactiveForeground": "#8d6e63",
    "tab.border": "#c9a06d0a",
    "sideBar.background": "#080706",
    "sideBar.foreground": "#bcaaa4",
    "sideBarSectionHeader.background": "#14120f",
    "list.activeSelectionBackground": "#c9a06d15",
    "list.activeSelectionForeground": "#e8e0d4",
    "list.hoverBackground": "#c9a06d0a",
    "list.focusBackground": "#c9a06d12",
    "input.background": "#141210",
    "input.foreground": "#e8e0d4",
    "input.border": "#c9a06d1a",
    "input.placeholderForeground": "#5d4037",
    "focusBorder": "#c9a06d",
    "button.background": "#c9a06d",
    "button.foreground": "#0d0b0a",
    "button.hoverBackground": "#a88550",
    "badge.background": "#c9a06d30",
    "badge.foreground": "#c9a06d",
    "titleBar.activeBackground": "#080706",
    "titleBar.activeForeground": "#bcaaa4",
    "statusBar.background": "#060504",
    "statusBar.foreground": "#8d6e63",
    "menu.background": "#14120f",
    "menu.foreground": "#bcaaa4",
    "editorWidget.background": "#100e0c",
    "editorWidget.border": "#c9a06d10",
    "terminal.foreground": "#bcaaa4",
    "terminal.ansiBlack": "#0d0b0a",
    "terminal.ansiRed": "#e57373",
    "terminal.ansiGreen": "#a5d6a7",
    "terminal.ansiYellow": "#f0c060",
    "terminal.ansiBlue": "#81d4fa",
    "terminal.ansiMagenta": "#ce93d8",
    "terminal.ansiCyan": "#80cbc4",
    "terminal.ansiWhite": "#e8e0d4",
    "terminal.ansiBrightBlack": "#5d4037",
    "terminal.ansiBrightRed": "#ef9a9a",
    "terminal.ansiBrightGreen": "#c8e6c9",
    "terminal.ansiBrightYellow": "#ffe082",
    "terminal.ansiBrightBlue": "#b3e5fc",
    "terminal.ansiBrightMagenta": "#e1bee7",
    "terminal.ansiBrightCyan": "#b2dfdb",
    "terminal.ansiBrightWhite": "#f5f0eb"
  }
}
```

- [ ] **Step 2: Verify the JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/shared/themes/data/Manifold Atelier.json', 'utf8')); console.log('Valid JSON')"`
Expected: `Valid JSON`

- [ ] **Step 3: Commit**

```bash
git add "src/shared/themes/data/Manifold Atelier.json"
git commit -m "feat: add Manifold Atelier theme"
```

---

### Task 9: Register New Themes in Theme Registry

**Files:**
- Modify: `src/shared/themes/theme-data.ts`

- [ ] **Step 1: Read the current theme-data.ts file to understand the import and registry pattern**

Read `src/shared/themes/theme-data.ts` fully to see how themes are imported and registered.

- [ ] **Step 2: Add imports for new theme JSON files**

Add to the import section:

```typescript
import manifoldMissionControlTheme from './data/Manifold Mission Control.json'
import manifoldAtelierTheme from './data/Manifold Atelier.json'
```

- [ ] **Step 3: Add entries to the theme data map**

Add to the `themeDataByLabel` map (or equivalent registry object):

```typescript
'Manifold Mission Control': manifoldMissionControlTheme,
'Manifold Atelier': manifoldAtelierTheme,
```

- [ ] **Step 4: Add entries to the theme list**

Add to the `themeList` array:

```typescript
{ id: 'manifold-mission-control', label: 'Manifold Mission Control', type: 'dark' },
{ id: 'manifold-atelier', label: 'Manifold Atelier', type: 'dark' },
```

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/themes/theme-data.ts
git commit -m "feat: register Mission Control and Atelier themes in theme registry"
```

---

### Task 10: Add Surface Tinting & Shadow Glow to Theme Adapter

**Files:**
- Modify: `src/shared/themes/adapter.ts:101-291` (inside `convertTheme()`)

- [ ] **Step 1: Read the convertTheme function fully**

Read `src/shared/themes/adapter.ts` lines 101-291 to understand the complete CSS variable generation.

- [ ] **Step 2: Add surface tinting logic**

Inside `convertTheme()`, after the elevated/overlay background variables are set (around line 205), add surface-tinted variants. Find where `--bg-elevated` is set and add after it:

```typescript
// Surface tinting — elevated surfaces pick up ~3% of accent color
const accentHex = normalizeHex(colors['focusBorder'] ?? colors['button.background'] ?? '#007acc')
const accentRgb = hexToRgb(accentHex)
if (accentRgb) {
  cssVars['--surface-tint'] = `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, 0.03)`
  cssVars['--shadow-glow'] = `0 4px 16px rgba(0, 0, 0, 0.3), 0 0 20px rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.06)`
}
```

- [ ] **Step 3: Add status glow CSS variables**

After the existing status color assignments (search for `--status-running`), add glow variants:

```typescript
// Status dot glows
const statusColors = {
  running: cssVars['--status-running'] ?? '#42a5f5',
  waiting: cssVars['--status-waiting'] ?? '#ffca28',
  done: cssVars['--status-done'] ?? '#66bb6a',
  error: cssVars['--status-error'] ?? '#ef5350',
}
for (const [status, color] of Object.entries(statusColors)) {
  const rgb = hexToRgb(normalizeHex(color))
  if (rgb) {
    cssVars[`--status-${status}-glow`] = `0 0 8px rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.3)`
  }
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/themes/adapter.ts
git commit -m "feat: add surface tinting and status glow CSS variable generation to theme adapter"
```

---

### Task 11: Add Ghost & Tertiary Button Styles to Workbench Primitives

**Files:**
- Modify: `src/renderer/components/workbench-style-primitives.ts`

- [ ] **Step 1: Read the current file**

Read `src/renderer/components/workbench-style-primitives.ts` fully.

- [ ] **Step 2: Add ghost button and tertiary button styles**

Add these to the `dialogPrimitives` object (after the existing `primaryButton` and `secondaryButton`):

```typescript
ghostButton: {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 'var(--control-height)',
  padding: '0 24px',
  background: 'transparent',
  border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--accent)',
  fontSize: 'var(--type-ui)',
  cursor: 'pointer',
  transition: 'border-color var(--duration-normal) var(--ease-premium), background var(--duration-normal) var(--ease-premium)',
} as React.CSSProperties,

ghostButtonHover: {
  borderColor: 'color-mix(in srgb, var(--accent), transparent 40%)',
  background: 'color-mix(in srgb, var(--accent), transparent 94%)',
} as React.CSSProperties,

tertiaryButton: {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 'var(--control-height)',
  padding: '0 12px',
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  fontSize: 'var(--type-ui)',
  cursor: 'pointer',
  transition: 'color var(--duration-normal) var(--ease-premium)',
} as React.CSSProperties,
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/workbench-style-primitives.ts
git commit -m "feat: add ghost button and tertiary button style primitives"
```

---

### Task 12: Add Density Selector to Settings UI

**Files:**
- Modify: `src/renderer/components/modals/settings/GeneralSettingsSection.tsx`

- [ ] **Step 1: Read the current GeneralSettingsSection fully**

Read `src/renderer/components/modals/settings/GeneralSettingsSection.tsx` to understand the field pattern.

- [ ] **Step 2: Add density selector to the Appearance section**

Find the "Appearance and Terminal" card section. Add a density field after the UI Mode selector (which is around lines 99-103). Follow the existing field pattern (label + select):

```tsx
<div>
  <label style={styles.label}>Density</label>
  <select
    style={styles.select}
    value={settings.density}
    onChange={(e) => onSettingsChange({ density: e.target.value as DensitySetting })}
  >
    <option value="compact">Compact</option>
    <option value="comfortable">Comfortable</option>
    <option value="spacious">Spacious</option>
  </select>
</div>
```

Make sure to import `DensitySetting` from `@shared/types` at the top of the file.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Verify in the app**

Run: `npm run dev`, open Settings → General → Appearance. The density dropdown should appear. Changing it should update the root element class and visibly change tab heights and row spacing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/settings/GeneralSettingsSection.tsx
git commit -m "feat: add density selector to settings UI"
```

---

### Task 13: Hide Tab Close Button Until Hover

**Files:**
- Modify: `src/renderer/styles/dockview-theme.css`

- [ ] **Step 1: Read the current dockview-theme.css**

Read `src/renderer/styles/dockview-theme.css` fully to find tab close button selectors.

- [ ] **Step 2: Add close button hover behavior**

Add these rules to the file (find the appropriate section near existing tab styles):

```css
/* Hide tab close button by default, show on tab hover */
.dockview-theme-manifold .dv-default-tab .dv-default-tab-action {
  opacity: 0;
  transition: opacity var(--duration-normal) var(--ease-premium);
}

.dockview-theme-manifold .dv-default-tab:hover .dv-default-tab-action {
  opacity: 1;
}

/* Always show close button on active tab */
.dockview-theme-manifold .dv-default-tab.dv-active-tab .dv-default-tab-action {
  opacity: 1;
}
```

- [ ] **Step 3: Verify in the app**

Run: `npm run dev`, open multiple tabs. Close buttons should only appear on hover or for the active tab.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles/dockview-theme.css
git commit -m "feat: hide tab close button until hover for cleaner tab bar"
```

---

## Phase 3: Component Refinements

### Task 14: Replace ASCII Logo with SVG Wordmark

**Files:**
- Modify: `src/renderer/components/modals/OnboardingView.tsx:6-10,65-67`

- [ ] **Step 1: Read the OnboardingView file fully**

Read `src/renderer/components/modals/OnboardingView.tsx`.

- [ ] **Step 2: Replace the LOGO constant with an SVG wordmark component**

Replace the `LOGO` constant (lines 6-10) and its rendering (lines 65-67) with an inline SVG wordmark. Replace the `const LOGO = ...` with:

```tsx
function ManifoldWordmark({ size = 'normal' }: { size?: 'normal' | 'large' }) {
  const fontSize = size === 'large' ? 32 : 22
  const trackingEm = size === 'large' ? '0.15em' : '0.12em'
  const ruleWidth = size === 'large' ? 60 : 40
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize,
        fontWeight: 200,
        letterSpacing: trackingEm,
        color: 'var(--text-primary)',
        opacity: 0.8,
        fontFamily: 'var(--font-sans)',
      }}>
        MANIFOLD
      </div>
      <div style={{
        width: ruleWidth,
        height: 1,
        background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
        margin: '8px auto 0',
        opacity: 0.5,
      }} />
    </div>
  )
}
```

- [ ] **Step 3: Update the rendering locations**

Replace the `<pre>` tag rendering the LOGO (line 65-67) with:

```tsx
<ManifoldWordmark size="normal" />
```

Search for any other usage of `LOGO` in the file and replace accordingly.

- [ ] **Step 4: Verify typecheck and visual appearance**

Run: `npm run typecheck`
Run: `npm run dev` and check that the wordmark appears on the new-agent and no-project screens.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/OnboardingView.tsx
git commit -m "feat: replace ASCII logo with SVG-style wordmark on onboarding screens"
```

---

### Task 15: Redesign New Agent Form

**Files:**
- Modify: `src/renderer/components/modals/NewAgentForm.tsx:10-36,175-191,288`

- [ ] **Step 1: Read the NewAgentForm file fully**

Read `src/renderer/components/modals/NewAgentForm.tsx` completely.

- [ ] **Step 2: Update the segmented toggle styles (lines 10-36)**

Replace the `segmentedStyles` object with premium styling:

```typescript
const segmentedStyles = {
  container: {
    display: 'flex',
    gap: 0,
    background: 'var(--bg-input, rgba(255,255,255,0.03))',
    borderRadius: 'var(--radius-md)',
    padding: 3,
    border: '1px solid var(--border)',
  } as React.CSSProperties,
  button: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '7px 24px',
    border: 'none',
    borderRadius: 'calc(var(--radius-md) - 2px)',
    fontSize: 'var(--type-ui-small)',
    fontWeight: 500,
    cursor: 'pointer',
    background: 'transparent',
    color: 'var(--text-muted)',
    transition: 'all var(--duration-normal) var(--ease-premium)',
  } as React.CSSProperties,
  buttonActive: {
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
  } as React.CSSProperties,
}
```

Remove the `divider` style if it exists — the new design doesn't need it.

- [ ] **Step 3: Update the title typography**

Find where "New agent for **{project}**" is rendered and update to use the new type scale:

```tsx
<div style={{
  fontSize: 'var(--type-title)',
  fontWeight: 300,
  color: 'var(--text-primary)',
  letterSpacing: 'var(--tracking-tight)',
  marginBottom: 'var(--space-xl)',
}}>
  New agent for <span style={{ fontWeight: 500 }}>{projectName}</span>
</div>
```

- [ ] **Step 4: Move Start button outside the input field**

Find the Start/Launch button (around line 288). Extract it from inside the input container to be a standalone element below the input:

```tsx
<button style={{
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 'var(--control-height)',
  padding: '0 32px',
  background: 'linear-gradient(135deg, var(--btn-bg), var(--btn-hover))',
  color: 'var(--btn-text)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--type-ui)',
  fontWeight: 500,
  cursor: 'pointer',
  letterSpacing: '0.02em',
  boxShadow: 'var(--shadow-glow, var(--shadow-subtle))',
  transition: 'filter var(--duration-normal) var(--ease-premium)',
  marginTop: 'var(--space-sm)',
}}>
  Start Agent
</button>
```

- [ ] **Step 5: Increase vertical spacing between form elements**

Add `marginBottom: 'var(--space-lg)'` or `gap: 'var(--space-lg)'` to the form container to increase breathing room between elements.

- [ ] **Step 6: Verify typecheck and visual appearance**

Run: `npm run typecheck`
Run: `npm run dev`, create a new agent. Verify: segmented toggle has clear active state, Start button is standalone and prominent, spacing feels generous.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/modals/NewAgentForm.tsx
git commit -m "feat: redesign new agent form with premium toggle, standalone start button, and generous spacing"
```

---

### Task 16: Redesign Welcome Dialog

**Files:**
- Modify: `src/renderer/components/modals/WelcomeDialog.tsx`

- [ ] **Step 1: Read the WelcomeDialog file fully**

Read `src/renderer/components/modals/WelcomeDialog.tsx` completely.

- [ ] **Step 2: Update the heading typography**

Find the "Start a new project" heading (or equivalent) and update to use the display type scale:

```tsx
<div style={{
  fontSize: 'var(--type-display)',
  fontWeight: 300,
  color: 'var(--text-primary)',
  letterSpacing: 'var(--tracking-tight)',
  marginBottom: 'var(--space-2xl)',
}}>
  Start a new project
</div>
```

- [ ] **Step 3: Update buttons to use ghost variant**

Find the "Open a local project" and "Clone a repository" buttons. Change their styling to use the ghost button pattern:

```typescript
const ghostButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 'var(--control-height)',
  padding: '0 24px',
  background: 'transparent',
  border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--accent)',
  fontSize: 'var(--type-ui)',
  cursor: 'pointer',
  transition: 'border-color var(--duration-normal) var(--ease-premium), background var(--duration-normal) var(--ease-premium)',
}
```

- [ ] **Step 4: Increase section spacing**

Add generous spacing between the logo, heading, textarea, divider, and buttons. Use `--space-2xl` (40px) between major sections and `--space-xl` between subsections.

- [ ] **Step 5: Verify typecheck and visual appearance**

Run: `npm run typecheck`
Run: `npm run dev` with no projects loaded. Verify the welcome screen feels premium with generous spacing, ghost buttons, and proper typography hierarchy.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/modals/WelcomeDialog.tsx
git commit -m "feat: redesign welcome dialog with premium typography, ghost buttons, and generous spacing"
```

---

### Task 17: Redesign Sidebar with Three-Tier Hierarchy

**Files:**
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx`
- Modify: `src/renderer/components/sidebar/ProjectSidebar.styles.ts`

- [ ] **Step 1: Read both sidebar files fully**

Read `src/renderer/components/sidebar/ProjectSidebar.tsx` and `ProjectSidebar.styles.ts`.

- [ ] **Step 2: Add section label styles to ProjectSidebar.styles.ts**

Add these styles to the styles object:

```typescript
sectionLabel: {
  fontSize: 'var(--type-label)',
  fontWeight: 500,
  letterSpacing: 'var(--tracking-wide)',
  textTransform: 'uppercase' as const,
  color: 'color-mix(in srgb, var(--accent), transparent 60%)',
  padding: '0 var(--space-sm)',
  marginBottom: 'var(--space-xs)',
} as React.CSSProperties,

sectionDivider: {
  height: 1,
  background: 'color-mix(in srgb, var(--accent), transparent 94%)',
  margin: 'var(--space-sm) var(--space-xs)',
} as React.CSSProperties,

inactiveList: {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 'var(--space-xs)',
  padding: '0 var(--space-sm)',
  fontSize: 'var(--type-ui-micro)',
  color: 'var(--text-muted)',
} as React.CSSProperties,

collapsedProject: {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px var(--space-sm)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  transition: 'background var(--duration-normal) var(--ease-premium)',
} as React.CSSProperties,

miniStatusDots: {
  display: 'flex',
  gap: 3,
  alignItems: 'center',
} as React.CSSProperties,

miniDot: {
  width: 5,
  height: 5,
  borderRadius: '50%',
  flexShrink: 0,
} as React.CSSProperties,
```

- [ ] **Step 3: Update ProjectList to categorize projects into three tiers**

In `ProjectSidebar.tsx`, update the `ProjectList` component (around line 136) to categorize projects:

```typescript
// Inside ProjectList component, before the return:
const activeProject = projects.find(p => p.id === activeProjectId)
const projectsWithAgents = projects.filter(p =>
  p.id !== activeProjectId &&
  allProjectSessions.some(s => s.projectId === p.id)
)
const inactiveProjects = projects.filter(p =>
  p.id !== activeProjectId &&
  !allProjectSessions.some(s => s.projectId === p.id)
)
```

Then render three sections:

```tsx
<div>
  {/* Tier 1: Active project — expanded */}
  {activeProject && (
    <>
      <ProjectItem key={activeProject.id} project={activeProject} isActive={true} /* ...existing props */ />
      {/* Render agent rows for active project */}
      {allProjectSessions
        .filter(s => s.projectId === activeProject.id)
        .map(session => <AgentItem key={session.id} session={session} /* ...existing props */ />)
      }
    </>
  )}

  {/* Divider */}
  {projectsWithAgents.length > 0 && <div style={styles.sectionDivider} />}

  {/* Tier 2: Projects with agents — collapsed with status dots */}
  {projectsWithAgents.length > 0 && (
    <>
      <div style={styles.sectionLabel}>Active</div>
      {projectsWithAgents.map(p => {
        const sessions = allProjectSessions.filter(s => s.projectId === p.id)
        return (
          <div key={p.id} style={styles.collapsedProject} onClick={() => onSelectProject(p.id)}>
            <span style={{ fontSize: 'var(--type-ui-small)', color: 'var(--text-secondary)' }}>{p.name}</span>
            <div style={styles.miniStatusDots}>
              {sessions.map(s => (
                <div key={s.id} style={{ ...styles.miniDot, background: `var(--status-${s.status})` }} />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )}

  {/* Divider */}
  {inactiveProjects.length > 0 && <div style={styles.sectionDivider} />}

  {/* Tier 3: Inactive projects — compact inline list */}
  {inactiveProjects.length > 0 && (
    <>
      <div style={styles.sectionLabel}>Inactive</div>
      <div style={styles.inactiveList}>
        {inactiveProjects.slice(0, 8).map((p, i) => (
          <span key={p.id}>
            <span style={{ cursor: 'pointer' }} onClick={() => onSelectProject(p.id)}>{p.name}</span>
            {i < Math.min(inactiveProjects.length, 8) - 1 && <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>·</span>}
          </span>
        ))}
        {inactiveProjects.length > 8 && <span>+{inactiveProjects.length - 8}</span>}
      </div>
    </>
  )}
</div>
```

Note: The exact prop names and session data structure will need to match the existing code. Read the file carefully and adapt the above to use the actual prop/type names from the component.

- [ ] **Step 4: Update action buttons to use ghost variant for secondary**

Update the `+ New Repository` button in the actions section (around line 104-106) to use ghost styling:

```typescript
actionButton: {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 'var(--control-height)',
  padding: '0 var(--space-sm)',
  background: 'transparent',
  border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--accent)',
  fontSize: 'var(--type-ui-small)',
  cursor: 'pointer',
  transition: 'border-color var(--duration-normal) var(--ease-premium), background var(--duration-normal) var(--ease-premium)',
} as React.CSSProperties,
```

- [ ] **Step 5: Verify typecheck and visual appearance**

Run: `npm run typecheck`
Run: `npm run dev` with multiple projects and agents. Verify:
- Active project shows expanded with agent rows
- Projects with agents show collapsed with mini status dots
- Inactive projects show as compact inline list
- Section labels appear in uppercase with wide tracking

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/sidebar/ProjectSidebar.tsx src/renderer/components/sidebar/ProjectSidebar.styles.ts
git commit -m "feat: redesign sidebar with three-tier project hierarchy and premium section labels"
```

---

### Task 18: Add Zone Background Classes & Remove Structural Borders

**Files:**
- Modify: `src/renderer/styles/theme.css`

- [ ] **Step 1: Add zone CSS classes to theme.css**

Add after the density classes:

```css
/* ── Contextual zones ── */
.zone-lobby {
  background: color-mix(in srgb, var(--bg-primary), black 15%);
}

.zone-workshop {
  background: var(--bg-primary);
}

.zone-library {
  background: color-mix(in srgb, var(--bg-primary), black 8%);
}

.zone-console {
  background: color-mix(in srgb, var(--bg-primary), black 20%);
}
```

- [ ] **Step 2: Remove structural borders from status bar**

Find the status bar CSS rules in theme.css (search for `layout-status-bar` or `statusbar`). If a `border-top` exists on the status bar, remove it or replace with:

```css
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "feat: add contextual zone background classes and soften structural borders"
```

---

### Task 19: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS with zero errors

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Visual verification with Mission Control theme**

Run: `npm run dev`
1. Open Settings → Appearance → Theme → select "Manifold Mission Control"
2. Verify: ice-blue accents, cool dark canvas, violet secondary color
3. Change density to each setting (Compact/Comfortable/Spacious) — verify tab heights and row heights change
4. Check sidebar: projects categorized into tiers
5. Check new agent screen: premium toggle, standalone Start button
6. Check welcome screen: ghost buttons, generous spacing
7. Hover over buttons — verify 250ms transitions, not instant snaps
8. Click buttons — verify scale(0.97) press feedback
9. Check tab bar — close buttons hidden until hover

- [ ] **Step 4: Visual verification with Atelier theme**

1. Switch theme to "Manifold Atelier"
2. Verify: warm gold accents, warm dark canvas, rose taupe secondary
3. All the same interactions work with warm color palette

- [ ] **Step 5: Verify existing themes still work**

1. Switch to "Dracula" theme — verify no regressions
2. Switch to "Manifold Dark" theme — verify no regressions
3. The structural improvements (timing, spacing, shadows) should apply regardless of theme

- [ ] **Step 6: Commit any final adjustments**

If any visual tweaks were needed, commit them:

```bash
git add -A
git commit -m "fix: visual adjustments from premium UI verification"
```
