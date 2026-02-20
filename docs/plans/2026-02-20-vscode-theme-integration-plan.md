# VS Code Theme Integration — Implementation Plan

## Goal

Replace the 2-theme system with 55+ bundled VS Code themes from `monaco-themes`, with a searchable picker, live preview, and unified theme application across the entire app.

## Architecture

Theme JSON files from `monaco-themes` are lazy-loaded and converted by an adapter into three outputs: CSS custom properties, Monaco editor theme definition, and xterm.js terminal colors. A registry manages the theme list and caching. The ThemePicker component provides search, filter, and live preview.

## Tech Stack

- `monaco-themes` (new dependency) — 55 pre-converted VS Code theme JSONs
- Existing: React 18, Monaco Editor, xterm.js, Electron IPC

## Ordered File List

### 1. `src/shared/themes/types.ts` (NEW)
- **Purpose:** Type definitions for the theme system
- **Key exports:** `ThemeMeta`, `ConvertedTheme`, `XtermTheme`
- **Dependencies:** None

### 2. `src/shared/themes/adapter.ts` (NEW)
- **Purpose:** Convert monaco-themes JSON → CSS vars + Monaco theme + xterm.js ITheme
- **Key exports:** `convertTheme()`, `applyThemeCssVars()`
- **Dependencies:** `types.ts`

### 3. `src/shared/themes/registry.ts` (NEW)
- **Purpose:** Theme list from themelist.json, lazy loading, caching
- **Key exports:** `getThemeList()`, `loadTheme()`
- **Dependencies:** `types.ts`, `adapter.ts`, `monaco-themes`

### 4. `package.json` (MODIFY)
- **Purpose:** Add `monaco-themes` dependency
- **Dependencies:** None

### 5. `src/shared/types.ts` (MODIFY)
- **Purpose:** Change `theme: 'dark' | 'light'` → `theme: string`
- **Dependencies:** None

### 6. `src/shared/defaults.ts` (MODIFY)
- **Purpose:** Change default theme from `'dark'` to `'dracula'`
- **Dependencies:** `types.ts`

### 7. `src/renderer/hooks/useTerminal.ts` (MODIFY)
- **Purpose:** Accept xterm ITheme object instead of `'dark' | 'light'` string
- **Dependencies:** `types.ts`

### 8. `src/renderer/hooks/useSettings.ts` (MODIFY)
- **Purpose:** Send `{ type, background }` to main process on theme change
- **Dependencies:** `types.ts`, `registry.ts`

### 9. `src/renderer/components/CodeViewer.tsx` (MODIFY)
- **Purpose:** Use dynamic theme ID instead of `'vs-dark' | 'vs'`
- **Dependencies:** None

### 10. `src/renderer/components/ThemePicker.tsx` (NEW)
- **Purpose:** Searchable theme picker with live preview
- **Key exports:** `ThemePicker`
- **Dependencies:** `registry.ts`, `types.ts`

### 11. `src/renderer/components/SettingsModal.tsx` (MODIFY)
- **Purpose:** Replace theme `<select>` with ThemePicker trigger button
- **Dependencies:** `ThemePicker.tsx`

### 12. `src/renderer/App.tsx` (MODIFY)
- **Purpose:** Wire theme adapter — apply CSS vars, pass xterm theme, register Monaco theme
- **Dependencies:** `registry.ts`, `adapter.ts`

### 13. `src/main/index.ts` (MODIFY)
- **Purpose:** Accept `{ type, background }` in `theme:changed` IPC handler
- **Dependencies:** None

### 14. `src/renderer/styles/theme.css` (MODIFY)
- **Purpose:** Keep `.theme-dark`/`.theme-light` as fallbacks — no removals needed
- **Dependencies:** None (no changes required; CSS vars override these at runtime)

### 15. `src/preload/index.ts` (NO CHANGE)
- `theme:changed` is already in `ALLOWED_SEND_CHANNELS` — no update needed
