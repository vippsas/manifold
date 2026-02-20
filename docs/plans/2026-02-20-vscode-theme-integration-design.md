# VS Code Theme Integration — Design Spec

## Summary

Replace the current 2-theme system (dark/light) with ~55 bundled VS Code-compatible themes from `monaco-themes`. Add a searchable theme picker with live preview. One global theme applies to the entire app — sidebar, terminals, code viewer, and status bar.

## Decisions

- **Theme source:** `monaco-themes` npm package (55 pre-converted themes)
- **Picker UX:** Searchable popup with dark/light filter and instant live preview
- **Scope:** Global — one theme for the whole app
- **Custom import:** Not in scope (can be added later)

## Current State

| Layer | How it works today |
|---|---|
| Settings | `theme: 'dark' \| 'light'` in `ManifoldSettings`, stored in `~/.manifold/config.json` |
| CSS | `.theme-dark` / `.theme-light` classes in `theme.css` set ~25 CSS custom properties |
| Monaco | Hardcoded `vs-dark` / `vs` passed to `<Editor theme={...}>` |
| xterm.js | `XTERM_THEMES` object in `useTerminal.ts` with 5 colors per theme (no ANSI colors) |
| Native | `nativeTheme.themeSource` + `THEME_BG` map in main process |
| Picker | `<select>` dropdown with 2 options in `SettingsModal` |

## Architecture

### Theme Adapter (`src/shared/themes/adapter.ts`)

Single function that converts a `monaco-themes` JSON theme into three outputs:

```
convertTheme(themeJson, themeId) → {
  cssVars:     Record<string, string>    // CSS custom properties
  monacoTheme: { base, inherit, rules, colors }  // monaco.editor.defineTheme() input
  xtermTheme:  ITheme                    // xterm.js terminal colors
  type:        'dark' | 'light'          // derived from background luminance
}
```

**CSS variable mapping** (VS Code token → Manifold CSS variable):

| CSS Variable | Primary Source | Fallback |
|---|---|---|
| `--bg-primary` | `colors["editor.background"]` | theme base (dark: `#1e1e1e`, light: `#ffffff`) |
| `--bg-secondary` | `colors["editorGroupHeader.tabsBackground"]` | darken/lighten `--bg-primary` by 5% |
| `--bg-sidebar` | `colors["sideBar.background"]` | darken/lighten `--bg-primary` by 8% |
| `--bg-input` | `colors["input.background"]` | darken/lighten `--bg-primary` by 3% |
| `--text-primary` | `colors["editor.foreground"]` | theme base (dark: `#d4d4d4`, light: `#1e1e1e`) |
| `--text-secondary` | `colors["descriptionForeground"]` | reduce opacity of `--text-primary` to 65% |
| `--text-muted` | `colors["disabledForeground"]` | reduce opacity of `--text-primary` to 40% |
| `--accent` | `colors["focusBorder"]` or `colors["button.background"]` | `#007acc` |
| `--accent-hover` | — | lighten `--accent` by 10% |
| `--border` | `colors["panel.border"]` or `colors["editorGroup.border"]` | derive from background |
| `--divider` | `colors["editorGroup.border"]` | same as `--border` at 70% opacity |
| `--scrollbar-thumb` | `colors["scrollbarSlider.background"]` | derive from background |
| `--scrollbar-track` | `colors["scrollbarSlider.activeBackground"]` | `transparent` |
| `--success` | — | keep current values per type |
| `--warning` | — | keep current values per type |
| `--error` | — | keep current values per type |
| `--status-*` | — | keep current values per type |
| `--diff-added-bg` | `colors["diffEditor.insertedTextBackground"]` | keep current values per type |
| `--diff-deleted-bg` | `colors["diffEditor.removedTextBackground"]` | keep current values per type |

**xterm.js ITheme mapping:**

| ITheme Key | Primary Source | Fallback |
|---|---|---|
| `background` | `colors["terminal.background"]` | `editor.background` |
| `foreground` | `colors["terminal.foreground"]` | `editor.foreground` |
| `cursor` | `colors["terminalCursor.foreground"]` | `--accent` |
| `cursorAccent` | `colors["terminalCursor.background"]` | `editor.background` |
| `selectionBackground` | `colors["terminal.selectionBackground"]` | `editor.selectionBackground` at 30% opacity |
| `black` | `colors["terminal.ansiBlack"]` | standard ANSI default |
| `red` | `colors["terminal.ansiRed"]` | standard ANSI default |
| `green` | `colors["terminal.ansiGreen"]` | standard ANSI default |
| `yellow` | `colors["terminal.ansiYellow"]` | standard ANSI default |
| `blue` | `colors["terminal.ansiBlue"]` | standard ANSI default |
| `magenta` | `colors["terminal.ansiMagenta"]` | standard ANSI default |
| `cyan` | `colors["terminal.ansiCyan"]` | standard ANSI default |
| `white` | `colors["terminal.ansiWhite"]` | standard ANSI default |
| `bright*` | `colors["terminal.ansiBright*"]` | lighten normal ANSI color by 30% |

**ANSI fallback defaults** (when theme has no terminal colors):

Dark themes: `{ black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510', blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5' }`

Light themes: `{ black: '#000000', red: '#cd3131', green: '#00bc00', yellow: '#949800', blue: '#0451a5', magenta: '#bc05bc', cyan: '#0598bc', white: '#555555' }`

**Theme type detection:** Calculate relative luminance of `editor.background`. Luminance > 0.5 = light, otherwise dark. Formula: `0.2126*R + 0.7152*G + 0.0722*B` (sRGB linearized).

### Theme Registry (`src/shared/themes/registry.ts`)

Manages the list of available themes and lazy-loads theme data.

```typescript
interface ThemeMeta {
  id: string        // e.g. 'dracula', 'nord'
  label: string     // e.g. 'Dracula', 'Nord'
  type: 'dark' | 'light'
}

function getThemeList(): ThemeMeta[]
function loadTheme(id: string): ConvertedTheme
```

- `getThemeList()` returns metadata for all 55+ themes (no heavy data loaded)
- `loadTheme(id)` imports the JSON on demand and runs it through the adapter
- Theme JSONs are `import()`-ed lazily to avoid loading all 55 at startup
- Results are cached in a `Map` after first load

Theme list is derived from `monaco-themes/themes/themelist.json` at build time. Each theme JSON file is in `node_modules/monaco-themes/themes/{id}.json`.

### Monaco Integration

In the renderer, before mounting any editor:

```typescript
import { loader } from '@monaco-editor/react'

// On theme change:
const theme = loadTheme(themeId)
const monaco = await loader.init()
monaco.editor.defineTheme(themeId, theme.monacoTheme)
monaco.editor.setTheme(themeId)
```

The `CodeViewer` component changes from:
```typescript
const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs'
```
to:
```typescript
const monacoTheme = currentThemeId  // e.g. 'dracula'
```

### CSS Variable Application

Instead of toggling `.theme-dark` / `.theme-light` CSS classes, the app applies CSS variables directly to the root element:

```typescript
function applyThemeCssVars(vars: Record<string, string>): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}
```

The `.theme-dark` and `.theme-light` classes in `theme.css` remain as fallbacks but are no longer the primary mechanism. The root `className` still gets `theme-dark` or `theme-light` based on the detected type (for any CSS selectors that depend on it).

### xterm.js Integration

`useTerminal.ts` changes:

- Remove the hardcoded `XTERM_THEMES` object
- Accept an `xtermTheme: ITheme` prop instead of `theme: 'dark' | 'light'`
- Apply theme to existing terminals via `terminal.options.theme = xtermTheme`
- React to theme changes with a `useEffect` that updates running terminals

### Native Window (Main Process)

The `theme:changed` IPC handler in `src/main/index.ts` currently receives `'dark' | 'light'`. Change it to receive `{ type: 'dark' | 'light', background: string }` so the window background color matches the actual theme.

```typescript
ipcMain.on('theme:changed', (_, payload: { type: string; background: string }) => {
  nativeTheme.themeSource = payload.type as 'dark' | 'light'
  mainWindow.setBackgroundColor(payload.background)
})
```

### Settings Type Change

```typescript
// Before:
interface ManifoldSettings {
  theme: 'dark' | 'light'
  // ...
}

// After:
interface ManifoldSettings {
  theme: string    // theme ID, e.g. 'dracula', 'nord', 'vs-dark', 'vs'
  // ...
}
```

Default value changes from `'dark'` to `'dracula'` (or another sensible dark default — to be decided during implementation).

Backward compatibility: if the stored value is `'dark'` or `'light'`, map to `'vs-dark'` / `'vs'` (the Monaco built-in equivalents) on load.

## Theme Picker UI

### Trigger

Replace the `<select>` dropdown in `SettingsModal` with a button that opens the theme picker. The button shows the current theme name and a color swatch.

### Picker Component (`ThemePicker`)

A modal/popover with:

1. **Search input** — filters themes by name, auto-focused on open
2. **Filter tabs** — `All` | `Dark` | `Light` — filters by detected theme type
3. **Theme list** — scrollable list of theme names with a small color swatch (background + foreground + accent preview)
4. **Live preview** — hovering or arrow-keying through themes applies them instantly to the app. Clicking or pressing Enter confirms. Pressing Escape reverts to the previous theme.

Layout: vertical list, ~300px wide, max 400px tall. Positioned relative to the settings modal or as a standalone centered modal.

### Keyboard Navigation

- `Up/Down` arrows move selection
- `Enter` confirms selection
- `Escape` cancels and reverts
- Typing filters the list (search input is focused)

### Live Preview Behavior

On hover/selection-change:
1. Run `loadTheme(hoveredId)` (cached after first load)
2. Apply CSS vars to root
3. Update Monaco theme
4. Update xterm.js theme on all active terminals
5. Update native window background

On cancel (Escape): revert all the above to the previously confirmed theme.

On confirm (Enter/click): persist `themeId` to settings via `settings:update` IPC.

## File Changes Summary

| File | Change |
|---|---|
| **New:** `src/shared/themes/adapter.ts` | Theme conversion: VS Code JSON → CSS vars + Monaco + xterm |
| **New:** `src/shared/themes/registry.ts` | Theme list, lazy loading, caching |
| **New:** `src/shared/themes/types.ts` | `ThemeMeta`, `ConvertedTheme` interfaces |
| **New:** `src/renderer/components/ThemePicker.tsx` | Searchable picker with live preview |
| `src/shared/types.ts` | `theme: string` (was `'dark' \| 'light'`) |
| `src/shared/defaults.ts` | Default theme ID |
| `src/renderer/components/SettingsModal.tsx` | Replace `<select>` with ThemePicker trigger |
| `src/renderer/components/CodeViewer.tsx` | Use dynamic Monaco theme ID |
| `src/renderer/hooks/useTerminal.ts` | Accept `ITheme` object, remove `XTERM_THEMES` |
| `src/renderer/hooks/useSettings.ts` | Apply theme via adapter on change |
| `src/renderer/App.tsx` | Wire theme adapter, apply CSS vars, pass xterm theme |
| `src/main/index.ts` | Accept `{ type, background }` in `theme:changed` IPC |
| `src/renderer/styles/theme.css` | Keep `.theme-dark`/`.theme-light` as fallbacks only |
| `package.json` | Add `monaco-themes` dependency |

## Dependencies

| Package | Purpose | Size |
|---|---|---|
| `monaco-themes` | 55 pre-converted theme JSONs | ~800KB (JSON files, tree-shakeable via lazy import) |

No other new dependencies. The adapter uses plain color math (hex→rgb, luminance) — no library needed for that.

## Migration & Backward Compatibility

1. Existing users have `theme: 'dark'` or `theme: 'light'` in `~/.manifold/config.json`
2. On settings load, map `'dark'` → a default dark theme ID, `'light'` → a default light theme ID
3. The two built-in Monaco themes (`vs-dark`, `vs`) are always available as options, ensuring the original look is preserved
4. `.theme-dark` / `.theme-light` CSS classes remain on root for any selectors that reference them

## Out of Scope

- Custom theme import (file picker for `.json` files)
- Fetching themes from Open VSX / VS Code Marketplace
- Per-agent theme selection
- Syntax highlighting theme preview in the picker (too complex for v1)
- Token color customization UI
