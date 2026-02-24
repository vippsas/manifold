# Update Toast Design

## Goal

Show a Cursor-style bottom-right toast notification when a new version of Manifold has been downloaded and is ready to install.

## Context

The main process already uses `electron-updater` to auto-download updates and pushes `updater:status` events (`available` / `downloaded`) to the renderer via IPC. The preload bridge whitelists `updater:status` (listen), `updater:install` (invoke), and `updater:check` (invoke). The renderer currently has no handling for these events.

## Design

### Data Flow

1. Main process `setupAutoUpdater` sends `updater:status` with `{ status: 'downloaded', version }` when update is downloaded.
2. `useUpdateNotification()` hook listens on `updater:status`, stores `{ version, dismissed }` in state.
3. `UpdateToast` renders when status is `downloaded` and not dismissed — fixed position bottom-right.
4. "Restart" button calls `window.electronAPI.invoke('updater:install')`.
5. Dismiss "x" sets `dismissed = true` (toast gone for this session).

### Toast Content

- Title: "Update available"
- Body: "Manifold v{version} is ready. Restart to update."
- Two actions: [Restart] button + dismiss x

### Visual Spec

- `position: fixed`, `bottom: 16px`, `right: 16px`, `z-index: 10000`
- Dark card using theme vars (`var(--surface)`, `var(--border)`)
- Subtle slide-up entrance animation via CSS keyframes
- ~300px wide

### Files

| File | Change |
|---|---|
| `src/renderer/hooks/useUpdateNotification.ts` | New hook with IPC listener |
| `src/renderer/components/UpdateToast.tsx` | New toast component |
| `src/renderer/components/UpdateToast.styles.ts` | Co-located styles |
| `src/renderer/App.tsx` | Mount UpdateToast using the hook |
