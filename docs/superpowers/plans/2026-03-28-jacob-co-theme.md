# Jacob & Co Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Manifold's visual identity with Jacob & Co watch-inspired structural changes (all themes) and a new default color palette.

**Architecture:** Two layers — (1) structural CSS/adapter changes affecting every theme (deeper shadows, gradient headers, bezel active states, refined radius/spacing, accent-dim dividers), (2) a new `Jacob Co Dark.json` Monaco theme as the default. Onboarding and simple views get hardcoded-value fixes and structural upgrades.

**Tech Stack:** CSS custom properties, TypeScript (adapter.ts), Monaco theme JSON, React inline styles

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/shared/themes/data/Jacob Co Dark.json` | Create | Monaco theme JSON with Jacob & Co palette |
| `src/shared/themes/theme-data.ts` | Modify | Import + register new theme |
| `src/shared/themes/adapter.ts` | Modify | Add `--accent-dim`, `--bg-chrome-hi`, `--bg-chrome-lo` derived tokens |
| `src/shared/defaults.ts` | Modify | Change default theme from `dracula` to `jacob-co-dark` |
| `src/renderer/styles/theme.css` | Modify | Shadow tokens, radius, spacing, divider hover, scrollbar hover |
| `src/renderer/styles/dockview-theme.css` | Modify | Use `--accent-dim` for drag-over, sash hover |
| `src/renderer/components/modals/WelcomeDialog.tsx` | Modify | Replace 3 hardcoded color values |
| `src/renderer/components/sidebar/NoProjectActions.tsx` | Modify | Replace error color fallback |
| `src/renderer-simple/styles/theme.css` | Modify | Add shadow tokens |
| `src/renderer-simple/App.tsx` | Modify | Alias new tokens in `applySimpleThemeVars()` |
| `src/renderer-simple/components/AppCard.styles.ts` | Modify | Add elevated shadow on hover |
| `src/renderer-simple/components/StatusBanner.styles.ts` | Modify | Gradient background |
| `src/renderer-simple/components/CreateAppDialog.styles.ts` | Modify | Overlay shadow |
| `src/renderer-simple/components/ConfirmDialog.styles.ts` | Modify | Overlay shadow |
| `src/renderer-simple/components/DeployModal.styles.ts` | Modify | Overlay shadow |
| `src/renderer-simple/components/ChatMessage.styles.ts` | Modify | Subtle shadow on agent bubbles |

---

### Task 1: Create Jacob Co Dark Theme JSON

**Files:**
- Create: `src/shared/themes/data/Jacob Co Dark.json`

- [ ] **Step 1: Create the Monaco theme JSON file**

Create `src/shared/themes/data/Jacob Co Dark.json`:

```json
{
  "base": "vs-dark",
  "inherit": true,
  "rules": [
    { "background": "0A0A0E", "token": "" },
    { "foreground": "6A6A78", "token": "comment" },
    { "foreground": "6A6A78", "token": "punctuation.definition.comment" },
    { "foreground": "E8B894", "token": "string" },
    { "foreground": "E6B422", "token": "constant.numeric" },
    { "foreground": "C9906D", "token": "constant.language" },
    { "foreground": "E6B422", "token": "constant.character" },
    { "foreground": "2D8B4E", "token": "constant.other" },
    { "foreground": "D4D4DC", "token": "variable" },
    { "foreground": "D4D4DC", "token": "variable.other.readwrite.instance" },
    { "foreground": "C9906D", "fontStyle": "bold", "token": "keyword" },
    { "foreground": "C9906D", "fontStyle": "bold", "token": "storage" },
    { "foreground": "C0C0C8", "fontStyle": "italic", "token": "storage.type" },
    { "foreground": "E8B894", "fontStyle": "underline", "token": "entity.name.class" },
    { "foreground": "E8B894", "fontStyle": "italic underline", "token": "entity.other.inherited-class" },
    { "foreground": "E8E8F0", "token": "entity.name.function" },
    { "foreground": "D4D4DC", "fontStyle": "italic", "token": "variable.parameter" },
    { "foreground": "C9906D", "token": "entity.name.tag" },
    { "foreground": "C0C0C8", "token": "entity.other.attribute-name" },
    { "foreground": "E8E8F0", "token": "support.function" },
    { "foreground": "2D8B4E", "token": "support.constant" },
    { "foreground": "C0C0C8", "fontStyle": "italic", "token": "support.type" },
    { "foreground": "C0C0C8", "fontStyle": "italic", "token": "support.class" },
    { "foreground": "E8E8F0", "background": "A0222F", "token": "invalid" },
    { "foreground": "E8E8F0", "background": "8B6249", "token": "invalid.deprecated" },
    { "foreground": "8888A0", "token": "meta.structure.dictionary.json string.quoted.double.json" },
    { "foreground": "6A6A78", "token": "meta.diff" },
    { "foreground": "6A6A78", "token": "meta.diff.header" },
    { "foreground": "A0222F", "token": "markup.deleted" },
    { "foreground": "2D8B4E", "token": "markup.inserted" },
    { "foreground": "E6B422", "token": "markup.changed" },
    { "foreground": "E6B422", "token": "constant.numeric.line-number.find-in-files - match" },
    { "foreground": "C9906D", "token": "entity.name.filename" },
    { "foreground": "A0222F", "token": "message.error" },
    { "foreground": "C9906D", "fontStyle": "bold", "token": "markup.heading.markdown" },
    { "foreground": "C9906D", "fontStyle": "bold", "token": "markup.heading.1.markdown" },
    { "foreground": "C9906D", "fontStyle": "bold", "token": "markup.heading.2.markdown" },
    { "foreground": "C9906D", "fontStyle": "bold", "token": "markup.heading.3.markdown" },
    { "foreground": "C9906D", "fontStyle": "bold", "token": "markup.heading.4.markdown" },
    { "foreground": "C9906D", "fontStyle": "bold", "token": "markup.heading.5.markdown" },
    { "foreground": "C9906D", "fontStyle": "bold", "token": "markup.heading.6.markdown" },
    { "foreground": "E8E8F0", "fontStyle": "bold", "token": "markup.bold.markdown" },
    { "foreground": "C0C0C8", "fontStyle": "italic", "token": "markup.italic.markdown" },
    { "foreground": "C9906D", "token": "punctuation.definition.metadata.markdown" },
    { "foreground": "E8E8F0", "token": "punctuation.definition.bold.markdown" },
    { "foreground": "C0C0C8", "token": "punctuation.definition.italic.markdown" },
    { "foreground": "8888A0", "token": "markup.inline.raw.markdown" },
    { "foreground": "8888A0", "token": "markup.raw.inline.markdown" },
    { "foreground": "8888A0", "token": "markup.raw.block.markdown" },
    { "foreground": "8888A0", "token": "punctuation.definition.raw.markdown" },
    { "foreground": "C9906D", "token": "markup.underline.link.markdown" },
    { "foreground": "C9906D", "token": "markup.underline.link.image.markdown" },
    { "foreground": "C9906D", "token": "string.other.link.title.markdown" },
    { "foreground": "E8E8F0", "token": "string.other.link.description.markdown" },
    { "foreground": "8888A0", "token": "markup.quote.markdown" },
    { "foreground": "8888A0", "token": "punctuation.definition.blockquote.markdown" },
    { "foreground": "E6B422", "token": "markup.list.unnumbered.markdown" },
    { "foreground": "E6B422", "token": "markup.list.numbered.markdown" },
    { "foreground": "E6B422", "token": "beginning.punctuation.definition.list.markdown" },
    { "foreground": "3A3A44", "token": "meta.separator.markdown" },
    { "foreground": "C9906D", "token": "punctuation.definition.string.begin.json - meta.structure.dictionary.value.json" },
    { "foreground": "C9906D", "token": "punctuation.definition.string.end.json - meta.structure.dictionary.value.json" },
    { "foreground": "8888A0", "token": "meta.structure.dictionary.json string.quoted.double.json" },
    { "foreground": "E8B894", "token": "meta.structure.dictionary.value.json string.quoted.double.json" },
    { "foreground": "9A9AAA", "token": "keyword.operator" },
    { "foreground": "6A6A78", "token": "punctuation" }
  ],
  "colors": {
    "editor.foreground": "#E8E8F0",
    "editor.background": "#0A0A0E",
    "editor.selectionBackground": "#C9906D33",
    "editor.lineHighlightBackground": "#141418",
    "editorCursor.foreground": "#C9906D",
    "editorWhitespace.foreground": "#1C1C22",
    "editorIndentGuide.activeBackground": "#2A2A32",
    "editor.selectionHighlightBorder": "#C9906D33",
    "editorGroupHeader.tabsBackground": "#141418",
    "sideBar.background": "#0E0E12",
    "input.background": "#16161A",
    "focusBorder": "#C9906D",
    "button.background": "#C9906D",
    "button.foreground": "#0A0A0E",
    "panel.border": "#2A2A32",
    "editorGroup.border": "#2A2A32",
    "scrollbarSlider.background": "#3A3A44",
    "descriptionForeground": "#9A9AAA",
    "disabledForeground": "#6A6A78",
    "list.activeSelectionBackground": "#C9906D22",
    "list.inactiveSelectionBackground": "#C9906D14",
    "list.hoverBackground": "#16161A",
    "tree.indentGuidesStroke": "#2A2A32",
    "statusBar.background": "#141418",
    "terminal.background": "#0A0A0E",
    "terminal.foreground": "#E8E8F0",
    "terminalCursor.foreground": "#C9906D",
    "terminalCursor.background": "#0A0A0E",
    "terminal.selectionBackground": "#C9906D40",
    "terminal.ansiBlack": "#0A0A0E",
    "terminal.ansiRed": "#C0334D",
    "terminal.ansiGreen": "#2D8B4E",
    "terminal.ansiYellow": "#E6B422",
    "terminal.ansiBlue": "#1B3A6B",
    "terminal.ansiMagenta": "#8B6249",
    "terminal.ansiCyan": "#5A8A9A",
    "terminal.ansiWhite": "#E8E8F0",
    "terminal.ansiBrightBlack": "#6A6A78",
    "terminal.ansiBrightRed": "#E05070",
    "terminal.ansiBrightGreen": "#4AAE6B",
    "terminal.ansiBrightYellow": "#F0D060",
    "terminal.ansiBrightBlue": "#4080C0",
    "terminal.ansiBrightMagenta": "#C9906D",
    "terminal.ansiBrightCyan": "#7AB0C0",
    "terminal.ansiBrightWhite": "#F0F0F8"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/themes/data/Jacob\ Co\ Dark.json
git commit -m "feat: add Jacob Co Dark monaco theme JSON"
```

---

### Task 2: Register Theme and Set as Default

**Files:**
- Modify: `src/shared/themes/theme-data.ts`
- Modify: `src/shared/defaults.ts`

- [ ] **Step 1: Add import to theme-data.ts**

Add after the `import theme_vipps_light` line (line 44):

```typescript
import theme_jacob_co_dark from './data/Jacob Co Dark.json'
```

- [ ] **Step 2: Add to themeDataByLabel**

Add after the `"idleFingers"` entry in `themeDataByLabel` (around line 88):

```typescript
  "Jacob Co Dark": theme_jacob_co_dark,
```

- [ ] **Step 3: Add to themeList**

Add after the `"idlefingers"` entry in `themeList` (around line 132):

```typescript
  "jacob-co-dark": "Jacob Co Dark",
```

- [ ] **Step 4: Change default theme in defaults.ts**

In `src/shared/defaults.ts`, change line 7:

```typescript
  theme: 'jacob-co-dark',
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — new JSON import resolves correctly.

- [ ] **Step 6: Commit**

```bash
git add src/shared/themes/theme-data.ts src/shared/defaults.ts
git commit -m "feat: register Jacob Co Dark theme and set as default"
```

---

### Task 3: Add Derived Tokens to Theme Adapter

**Files:**
- Modify: `src/shared/themes/adapter.ts:97-211`

- [ ] **Step 1: Add `--accent-dim` to cssVars**

In `adapter.ts`, in the `cssVars` object (after the `'--accent-hover'` line, around line 116), add:

```typescript
    '--accent-dim': darken(accent, 30),
```

- [ ] **Step 2: Add `--bg-chrome-hi` and `--bg-chrome-lo`**

In the `cssVars` object, after the `'--bg-chrome'` assignment (around line 161), add:

```typescript
    '--bg-chrome-hi': isDark
      ? lighten(c('editorGroupHeader.tabsBackground') ?? (isDark ? lighten(editorBg, 8) : darken(editorBg, 5)), 3)
      : darken(c('editorGroupHeader.tabsBackground') ?? (isDark ? lighten(editorBg, 8) : darken(editorBg, 5)), 3),
    '--bg-chrome-lo': isDark
      ? darken(c('editorGroupHeader.tabsBackground') ?? (isDark ? lighten(editorBg, 8) : darken(editorBg, 5)), 3)
      : lighten(c('editorGroupHeader.tabsBackground') ?? (isDark ? lighten(editorBg, 8) : darken(editorBg, 5)), 3),
```

- [ ] **Step 3: Update bezel-style active state opacity**

In `adapter.ts`, in the `cssVars` object, find the `'--sidebar-active-bg'` assignment (around line 193) and update:

Old:
```typescript
    '--sidebar-active-bg': c('list.inactiveSelectionBackground')
      ?? withOpacity(accent, isDark ? 0.14 : 0.1),
    '--sidebar-active-border': c('list.activeSelectionBackground')
      ?? withOpacity(accent, isDark ? 0.28 : 0.18),
```

New:
```typescript
    '--sidebar-active-bg': c('list.inactiveSelectionBackground')
      ?? withOpacity(accent, isDark ? 0.08 : 0.06),
    '--sidebar-active-border': c('list.activeSelectionBackground')
      ?? withOpacity(accent, isDark ? 0.15 : 0.1),
```

This creates a subtler bezel effect rather than a strong accent color wash.

- [ ] **Step 4: Add `--shadow-elevated`**

In the `cssVars` object, after the `'--shadow-overlay'` line (around line 210), add:

```typescript
    '--shadow-elevated': isDark
      ? '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03)'
      : '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/themes/adapter.ts
git commit -m "feat: add accent-dim, chrome gradient, and elevated shadow derived tokens"
```

---

### Task 4: Update Main Renderer Structural CSS

**Files:**
- Modify: `src/renderer/styles/theme.css:1-104` (custom properties)
- Modify: `src/renderer/styles/theme.css:197-245` (dividers)
- Modify: `src/renderer/styles/theme.css:133-150` (scrollbar)

- [ ] **Step 1: Update shadow tokens**

In `theme.css`, replace lines 101-103:

Old:
```css
  --shadow-subtle: 0 1px 0 rgba(0, 0, 0, 0.12);
  --shadow-popover: 0 8px 24px rgba(0, 0, 0, 0.22);
  --shadow-overlay: 0 16px 40px rgba(0, 0, 0, 0.28);
```

New:
```css
  --shadow-subtle: 0 2px 8px rgba(0, 0, 0, 0.2);
  --shadow-popover: 0 8px 24px rgba(0, 0, 0, 0.35);
  --shadow-overlay: 0 16px 48px rgba(0, 0, 0, 0.45);
  --shadow-elevated: 0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03);
```

- [ ] **Step 2: Update border radius tokens**

In `theme.css`, replace lines 8-12:

Old:
```css
  --radius-xs: 2px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-pill: 999px;
```

New:
```css
  --radius-xs: 2px;
  --radius-sm: 5px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-pill: 999px;
```

- [ ] **Step 3: Update spacing tokens**

In `theme.css`, replace lines 14-18:

Old:
```css
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
```

New:
```css
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 14px;
  --space-lg: 18px;
  --space-xl: 28px;
```

- [ ] **Step 4: Update divider hover to use accent-dim**

In `theme.css`, replace the pane-divider hover rules (lines 208-211):

Old:
```css
.pane-divider:hover,
.pane-divider.dragging {
  background: var(--accent);
}
```

New:
```css
.pane-divider:hover,
.pane-divider.dragging {
  background: var(--accent-dim, var(--accent));
}
```

Also replace the horizontal divider hover (lines 233-235):

Old:
```css
.pane-divider-horizontal:hover,
.pane-divider-horizontal.dragging {
  background: var(--accent);
}
```

New:
```css
.pane-divider-horizontal:hover,
.pane-divider-horizontal.dragging {
  background: var(--accent-dim, var(--accent));
}
```

- [ ] **Step 5: Update scrollbar thumb hover**

In `theme.css`, replace the scrollbar thumb hover rule (line 148-150):

Old:
```css
::-webkit-scrollbar-thumb:hover {
  background: var(--accent);
}
```

New:
```css
::-webkit-scrollbar-thumb:hover {
  background: var(--accent-dim, var(--accent));
}
```

- [ ] **Step 6: Add gradient to status bar**

In `theme.css`, update `.layout-status-bar` background (around line 185):

Old:
```css
  background: var(--statusbar-bg);
```

New:
```css
  background: linear-gradient(180deg, var(--bg-chrome, var(--statusbar-bg)) 0%, var(--bg-chrome-lo, var(--statusbar-bg)) 100%);
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "feat: update structural CSS tokens — shadows, radius, spacing, divider hover"
```

---

### Task 5: Update Dockview Theme CSS

**Files:**
- Modify: `src/renderer/styles/dockview-theme.css`

- [ ] **Step 1: Update drag-over color to use accent-dim**

In `dockview-theme.css`, update line 21:

Old:
```css
  --dv-drag-over-background-color: rgba(0, 122, 204, 0.15);
```

New:
```css
  --dv-drag-over-background-color: var(--accent-subtle, rgba(0, 122, 204, 0.15));
```

- [ ] **Step 2: Add sash hover color**

After the `.dockview-theme-manifold .dv-tab` rule (after line 37), add:

```css
/* Sash hover — use muted accent for resize handle highlight */
.dockview-theme-manifold .dv-sash:hover {
  background: var(--accent-dim, var(--accent));
  transition: background 0.15s ease;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles/dockview-theme.css
git commit -m "feat: update dockview theme with accent-dim sash hover"
```

---

### Task 6: Fix Onboarding Hardcoded Values

**Files:**
- Modify: `src/renderer/components/modals/WelcomeDialog.tsx:82,96,108`
- Modify: `src/renderer/components/sidebar/NoProjectActions.tsx:177`

- [ ] **Step 1: Fix WelcomeDialog overlay backdrop**

In `WelcomeDialog.tsx`, in the `styles` object, update the `overlay.background` (line 96):

Old:
```typescript
    background: 'rgba(0, 0, 0, 0.6)',
```

New:
```typescript
    background: 'var(--overlay-backdrop, rgba(0, 0, 0, 0.44))',
```

- [ ] **Step 2: Fix WelcomeDialog dialog shadow**

In the `styles` object, update `panel.boxShadow` (line 108):

Old:
```typescript
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
```

New:
```typescript
    boxShadow: 'var(--shadow-overlay)',
```

- [ ] **Step 3: Fix WelcomeDialog error fallback**

In `WelcomeDialog.tsx`, update the clone error color (line 82):

Old:
```typescript
                <div style={{ fontSize: 12, color: 'var(--status-error, #f44)' }}>{cloneError}</div>
```

New:
```typescript
                <div style={{ fontSize: 12, color: 'var(--error)' }}>{cloneError}</div>
```

- [ ] **Step 4: Fix NoProjectActions error fallback**

In `NoProjectActions.tsx`, update the error color (line 177):

Old:
```typescript
            <div style={{ fontSize: 12, color: 'var(--status-error, #f44)', maxWidth: 480 }}>{createError}</div>
```

New:
```typescript
            <div style={{ fontSize: 12, color: 'var(--error)', maxWidth: 480 }}>{createError}</div>
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/WelcomeDialog.tsx src/renderer/components/sidebar/NoProjectActions.tsx
git commit -m "fix: replace hardcoded colors in onboarding with theme CSS vars"
```

---

### Task 7: Update Simple View Theme Aliasing

**Files:**
- Modify: `src/renderer-simple/App.tsx:64-71`
- Modify: `src/renderer-simple/styles/theme.css`

- [ ] **Step 1: Add new token aliases in applySimpleThemeVars**

In `src/renderer-simple/App.tsx`, update the `applySimpleThemeVars` function (lines 64-71):

Old:
```typescript
function applySimpleThemeVars(theme: ConvertedTheme): void {
  const vars = theme.cssVars
  applyThemeCssVars(vars)
  const root = document.documentElement
  root.style.setProperty('--bg', vars['--bg-primary'])
  root.style.setProperty('--surface', vars['--bg-secondary'])
  root.style.setProperty('--text', vars['--text-primary'])
}
```

New:
```typescript
function applySimpleThemeVars(theme: ConvertedTheme): void {
  const vars = theme.cssVars
  applyThemeCssVars(vars)
  const root = document.documentElement
  root.style.setProperty('--bg', vars['--bg-primary'])
  root.style.setProperty('--surface', vars['--bg-secondary'])
  root.style.setProperty('--text', vars['--text-primary'])
  root.style.setProperty('--accent-dim', vars['--accent-dim'])
  root.style.setProperty('--shadow-elevated', vars['--shadow-elevated'])
  root.style.setProperty('--shadow-overlay', vars['--shadow-overlay'])
  root.style.setProperty('--shadow-subtle', vars['--shadow-subtle'])
  root.style.setProperty('--bg-chrome-hi', vars['--bg-chrome-hi'])
  root.style.setProperty('--bg-chrome-lo', vars['--bg-chrome-lo'])
}
```

- [ ] **Step 2: Add shadow defaults to simple view theme.css**

In `src/renderer-simple/styles/theme.css`, after the `--radius: 12px;` line (line 14), add:

```css
  --shadow-subtle: 0 2px 8px rgba(0, 0, 0, 0.2);
  --shadow-elevated: 0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03);
  --shadow-overlay: 0 16px 48px rgba(0, 0, 0, 0.45);
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer-simple/App.tsx src/renderer-simple/styles/theme.css
git commit -m "feat: alias new theme tokens into simple view"
```

---

### Task 8: Update Simple View Component Styles

**Files:**
- Modify: `src/renderer-simple/components/AppCard.styles.ts`
- Modify: `src/renderer-simple/components/StatusBanner.styles.ts`
- Modify: `src/renderer-simple/components/CreateAppDialog.styles.ts`
- Modify: `src/renderer-simple/components/ConfirmDialog.styles.ts`
- Modify: `src/renderer-simple/components/DeployModal.styles.ts`
- Modify: `src/renderer-simple/components/ChatMessage.styles.ts`

- [ ] **Step 1: Add elevated shadow to AppCard**

In `AppCard.styles.ts`, update the `card` export. Replace:

```typescript
export const card: CSSProperties = {
  position: 'relative',
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
  padding: 24,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  transition: 'border-color 0.2s',
}
```

With:

```typescript
export const card: CSSProperties = {
  position: 'relative',
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
  padding: 24,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  transition: 'border-color 0.2s, box-shadow 0.2s',
}

export const cardHover: CSSProperties = {
  ...card,
  boxShadow: 'var(--shadow-elevated)',
}
```

Note: The component `AppCard.tsx` must apply `cardHover` on hover. If it already handles hover via JS state, use that. If it uses CSS `:hover` only via the `transition` on `border-color`, the component needs a minor update to toggle `boxShadow` on hover state. Check the component and apply accordingly — if the component doesn't track hover state, just add the shadow to the base `card` style directly:

```typescript
export const card: CSSProperties = {
  position: 'relative',
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
  padding: 24,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-elevated)',
  transition: 'border-color 0.2s',
}
```

- [ ] **Step 2: Add gradient background to StatusBanner**

In `StatusBanner.styles.ts`, update the `container` export:

Old:
```typescript
export const container: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  padding: '8px 16px',
  borderBottom: '1px solid var(--border)',
  gap: 12,
}
```

New:
```typescript
export const container: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  padding: '8px 16px',
  borderBottom: '1px solid var(--border)',
  gap: 12,
  background: 'linear-gradient(180deg, var(--bg-chrome-hi, var(--surface)) 0%, var(--surface) 100%)',
}
```

- [ ] **Step 3: Add overlay shadow to CreateAppDialog**

In `CreateAppDialog.styles.ts`, update the `overlay` and `dialog` exports:

Update `overlay`:
Old:
```typescript
  background: 'rgba(0, 0, 0, 0.5)',
```
New:
```typescript
  background: 'var(--overlay-backdrop, rgba(0, 0, 0, 0.5))',
```

Update `dialog`, add boxShadow:
Old:
```typescript
export const dialog: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 32,
  maxWidth: 560,
  width: '92%',
  maxHeight: '85vh',
  overflowY: 'auto',
}
```
New:
```typescript
export const dialog: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 32,
  maxWidth: 560,
  width: '92%',
  maxHeight: '85vh',
  overflowY: 'auto',
  boxShadow: 'var(--shadow-overlay)',
}
```

- [ ] **Step 4: Add overlay shadow to ConfirmDialog**

In `ConfirmDialog.styles.ts`, update `overlay` and `dialog`:

Update `overlay`:
Old:
```typescript
  background: 'rgba(0, 0, 0, 0.5)',
```
New:
```typescript
  background: 'var(--overlay-backdrop, rgba(0, 0, 0, 0.5))',
```

Update `dialog`, add boxShadow:
Old:
```typescript
export const dialog: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 32,
  maxWidth: 400,
  width: '90%',
}
```
New:
```typescript
export const dialog: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 32,
  maxWidth: 400,
  width: '90%',
  boxShadow: 'var(--shadow-overlay)',
}
```

- [ ] **Step 5: Add overlay shadow to DeployModal**

In `DeployModal.styles.ts`, update `overlay` and `modal`:

Update `overlay`:
Old:
```typescript
  background: 'rgba(0, 0, 0, 0.6)',
```
New:
```typescript
  background: 'var(--overlay-backdrop, rgba(0, 0, 0, 0.6))',
```

Update `modal`, add boxShadow:
Old:
```typescript
export const modal: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 12,
  padding: 32,
  width: 400,
  textAlign: 'center',
  border: '1px solid var(--border)',
}
```
New:
```typescript
export const modal: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 12,
  padding: 32,
  width: 400,
  textAlign: 'center',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-overlay)',
}
```

- [ ] **Step 6: Add subtle shadow to agent chat bubbles**

In `ChatMessage.styles.ts`, update the `bubble` function. Only add shadow for agent (non-user) bubbles:

Old:
```typescript
export const bubble = (isUser: boolean): CSSProperties => ({
  maxWidth: '85%',
  padding: '12px 16px',
  borderRadius: 16,
  fontSize: 15,
  lineHeight: 1.6,
  background: isUser ? 'transparent' : 'var(--surface)',
  color: 'var(--text)',
  border: isUser ? '1px solid var(--accent)' : '1px solid var(--border)',
})
```

New:
```typescript
export const bubble = (isUser: boolean): CSSProperties => ({
  maxWidth: '85%',
  padding: '12px 16px',
  borderRadius: 16,
  fontSize: 15,
  lineHeight: 1.6,
  background: isUser ? 'transparent' : 'var(--surface)',
  color: 'var(--text)',
  border: isUser ? '1px solid var(--accent)' : '1px solid var(--border)',
  boxShadow: isUser ? undefined : 'var(--shadow-subtle)',
})
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer-simple/components/AppCard.styles.ts src/renderer-simple/components/StatusBanner.styles.ts src/renderer-simple/components/CreateAppDialog.styles.ts src/renderer-simple/components/ConfirmDialog.styles.ts src/renderer-simple/components/DeployModal.styles.ts src/renderer-simple/components/ChatMessage.styles.ts
git commit -m "feat: apply structural shadow/gradient upgrades to simple view components"
```

---

### Task 9: Verify and Fix

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS — all types resolve correctly.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All existing tests pass. The theme changes are CSS-only and don't affect test logic. The `defaults.ts` change may cause a settings test to expect `'dracula'` — if so, update it.

- [ ] **Step 3: Fix any failing test expectations**

If `src/renderer/hooks/useSettings.test.ts` fails because it expects `theme: 'dracula'`, update the expected value:

Old:
```typescript
    const customSettings = { ...DEFAULT_SETTINGS, theme: 'dracula' }
```

This line constructs custom settings by overriding the default — it should still work since it explicitly sets `theme: 'dracula'`. But if any test asserts `DEFAULT_SETTINGS.theme === 'dracula'`, change it to `'jacob-co-dark'`.

- [ ] **Step 4: Run typecheck + tests together**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 5: Final commit if tests needed updating**

```bash
git add -A
git commit -m "fix: update test expectations for new default theme"
```
