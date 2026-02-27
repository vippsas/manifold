# Web Preview Feature Design

## Goal

Detect when an agent's dev server starts and automatically show a live web preview in the Manifold layout, similar to VS Code's Simple Browser / Cursor's built-in browser.

## Detection: `url-detector.ts`

New module following the `add-dir-detector.ts` pattern:

- Strips ANSI escape sequences and cursor-movement codes
- Regex-matches localhost URLs: `/(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{1,5})/`
- Also catches common dev server patterns (Vite `Local:`, Next.js, etc.)
- Runs on last 2000 chars of `session.outputBuffer`
- Returns `{ url: string, port: number } | null`
- First detected URL per session wins; subsequent detections ignored

Wired into `SessionManager.wireOutputStreaming()` alongside `detectAddDir()`.

## IPC: Push Channel

New push channel `preview:url-detected` with payload `{ sessionId: string, url: string }`.

Three-place update:
1. `session-manager.ts` — emits via `this.sendToRenderer()`
2. `preload/index.ts` — add to `ALLOWED_LISTEN_CHANNELS`
3. Renderer — consumed by `useWebPreview` hook

No request/response channels needed.

## Renderer Hook: `useWebPreview`

New `src/renderer/hooks/useWebPreview.ts`:

- Listens to `preview:url-detected` via `useIpcListener`
- Tracks `{ url: string | null, isOpen: boolean }` per session
- Exposes `previewUrl`, `isPreviewOpen`, `openPreview()`, `closePreview()`
- Auto-sets `isOpen = true` on first URL detection
- Clears state on session change

## Dockview Panel: Dynamic (Not Static)

The web preview panel is NOT added to the static `PANEL_IDS` array. It is a dynamic panel:

- Registered in `PANEL_COMPONENTS` as `'webPreview'`
- Added via `api.addPanel()` positioned `'within'` the editor group (sibling tab)
- Removed via `api.removePanel()` on close
- Does not participate in default layout, toggle, restore-hints, or snapshot logic

This approach keeps existing panels completely untouched. Saved layouts without `webPreview` restore normally.

## WebPreview Component

New `src/renderer/components/WebPreview.tsx`:

- Electron `<webview>` tag (full browser capabilities, DevTools support)
- Minimal toolbar: read-only URL display, reload button, open-in-browser button
- Connection error handling with "Server not reachable" + retry
- Cache-busting timestamp param on manual reload (VS Code's technique)

## Electron Config

Enable `webviewTag: true` in `BrowserWindow` `webPreferences` (required for `<webview>` tag).

## DockAppState Additions

Add to `DockAppState` interface:
- `previewUrl: string | null`
- `onOpenPreview: () => void`
- `onClosePreview: () => void`

## Decisions

- **Auto-open**: Preview panel opens automatically when a URL is detected
- **Position**: Opens as a tab alongside the Editor panel (same group)
- **Rendering**: Electron `<webview>` tag (not iframe)
- **Multiple URLs**: First detected URL wins, others ignored
- **Refresh**: Relies on dev server HMR; manual reload button as fallback
