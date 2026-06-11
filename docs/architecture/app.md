---
description: How the Electron main process boots — shell PATH, dev profile, module wiring, app lifecycle, window creation, menus, auto-updater, mode switching, and the live-preview dev server.
covers: [src/main/app]
updated: 2026-06-11
owner: see .github/CODEOWNERS
---

# App — the Electron main-process shell & lifecycle

This is the entry point of Manifold's main process: `src/main/app/index.ts` is the
file electron-vite compiles to `out/main/index.js` (`electron.vite.config.ts:11`,
`package.json:5`). It runs a few environment fixups, constructs every long-lived
manager as a module-scoped singleton, wires them into the IPC dependency bundle,
and registers the Electron lifecycle. The rest of this subsystem is the supporting
machinery a desktop shell needs — window creation, the macOS app menu, the
auto-updater, a loopback HTTP server for the renderer, mode switching, and the
dev-server manager that powers live preview of generated (simple-mode) apps.

## Covered code

- `src/main/app/index.ts` — process entry. Runs side-effect fixups at import time, instantiates all managers, builds `ipcDeps`, and calls `registerAppLifecycle`.
- `src/main/app/app-lifecycle.ts` — `registerAppLifecycle()`: `whenReady` → renderer server + window + updater; `activate`/`window-all-closed`/`before-quit` handlers.
- `src/main/app/window-factory.ts` — `createWindow()` / `rebuildAppMenu()`: the `BrowserWindow`, webview hardening, renderer loading, one-time IPC registration.
- `src/main/app/app-menu.ts` — `buildAppMenu()`: the macOS application menu; every custom item is an IPC `send` to the renderer.
- `src/main/app/ipc-handlers.ts` — `registerIpcHandlers()`: fans out to every `register*Handlers(deps)` module plus a handful of inline `app:*`/`updater:*`/`release-notes:*`/`font:*` handlers.
- `src/main/app/auto-updater.ts` — `setupAutoUpdater()`, `checkForUpdates()`, release-notes fetch/caching; wraps `electron-updater`.
- `src/main/app/dev-server-manager.ts` — `DevServerManager`: simple-mode dev server lifecycle, print-mode follow-up turns, and slash-command probing.
- `src/main/app/mode-switcher.ts` — `ModeSwitcher`: `app:switch-mode` between `developer`/`simple`, plus `theme:changed` and `app:consume-pending-launch`.
- `src/main/app/local-renderer-server.ts` — `startLocalRendererServer()`: a static loopback HTTP server so the renderer has a real `http://127.0.0.1` origin in production.
- `src/main/app/shell-path.ts` — `loadShellPath()`: resolves the login-shell `PATH` (macOS) so spawned agent binaries are found.
- `src/main/app/dev-profile.ts` — `configureDevProfilePaths()`: isolates dev runs into a separate userData profile.
- `src/main/app/power-manager.ts` — `PowerManager`: wraps `powerSaveBlocker` for "Keep Mac Awake".
- `src/main/app/debug-log.ts` — `DebugLogger` / `debugLog()`: buffered async append to `~/.manifold/debug.log`.

## How it works

**Boot order matters.** `index.ts` does work *before* any other import. `loadShellPath()`
and `configureDevProfilePaths(app)` run first (`index.ts:6`), then `process.env.CLAUDECODE`
is deleted so spawned Claude agents don't mistake themselves for nested sessions and refuse
to start (`index.ts:11`). Only then are the manager classes imported and instantiated. The
module body builds the full object graph eagerly: stores, `WorktreeManager`, `PtyPool`,
`SessionManager`, file watchers, workspace modules, memory modules, the verdict recorder, and
the `PluginManager` (whose `scan()` runs immediately, `index.ts:116`). Cross-cutting
collaborators are wired with post-construction setters (`sessionManager.setChatAdapter`,
`setMemoryCapture`, `setVerdictRecorder`, …, `index.ts:92`). Everything the renderer can reach
is collected into a single `ipcDeps` bundle plus a `send` closure that guards against a
destroyed window (`index.ts:118`).

**Window vs. handlers.** `doCreateWindow()` (`index.ts:156`) calls `createWindow()` and, on
each new window, re-wires the main-window reference into `sessionManager`, `fileWatcher`, and
`pluginManager` via `wireMainWindow`. IPC handlers, by contrast, are registered exactly once:
`window-factory.ts` guards `registerIpcHandlers` behind a module-level `ipcHandlersRegistered`
flag (`window-factory.ts:100`) — windows come and go (mode switching destroys and recreates
the window), but `ipcMain.handle` registrations must not be duplicated.

**Lifecycle.** `registerAppLifecycle()` (`app-lifecycle.ts:33`) owns the Electron app events.
On `whenReady` it (production only) starts the loopback renderer server and pins
`ELECTRON_RENDERER_URL` to it (`app-lifecycle.ts:42`), enables keep-awake if set, installs the
webview protocol, creates the first window, starts the auto-updater, and prunes old raw
memory. `activate` recreates a window if none exist (macOS
dock behavior); `window-all-closed` quits on non-darwin. `before-quit` is the teardown path:
flush debounced chat writes synchronously, flush buffered debug-log lines, kill all sessions
and PTYs, kill any in-flight `aiGenerate` model subprocesses
(`killInFlightAiGenerateChildren()`, so they don't orphan), and dispose the plugin host. Then —
*before the first `await`*, because Electron does not await async `before-quit` listeners —
synchronously close the memory store (checkpointing the SQLite WAL) and release the power
blocker; the best-effort async steps (unwatch files, close the renderer server) run last
(`app-lifecycle.ts:88`).

**Window creation.** `createWindow()` (`window-factory.ts:53`) resolves the theme type/background
from the saved theme, builds a 1400×900 `BrowserWindow` with a `hiddenInset` title bar and
context isolation, then hardens `<webview>`s: `will-attach-webview` strips the preload, forces
isolation, and rejects any non-localhost `src` (`window-factory.ts:77`). It loads the renderer
from `ELECTRON_RENDERER_URL` (dev: electron-vite; prod: the loopback server), falling back to
`file://` only if the server failed to bind (`window-factory.ts:142`). External links are
diverted to the system browser via `setWindowOpenHandler` + `will-navigate`. The application
menu is set last.

**App menu.** `buildAppMenu()` (`app-menu.ts:8`) is almost entirely a router: every custom
item (`About`, `What's New`, `Settings…`, panel toggles, `Find in Files`, `Jump to Favorite N`)
sends to a renderer channel via a local `send` helper that guards with `isDestroyed()` — the
captured window survives a macOS Cmd+W as a destroyed (non-null) object, so optional chaining
alone would still throw on `.webContents`; the rest are built-in roles.
The only stateful item is the `Keep Mac Awake` checkbox, whose `checked` state is passed in and
re-rendered via `rebuildAppMenu()` when toggled (`index.ts:143`).

**Live preview / simple mode.** `DevServerManager` (`dev-server-manager.ts:16`) backs
simple-mode "apps". `startDevServerSession()` evicts any existing sessions for the project
by routing each through `SessionManager.killSession` (`:42`) so the full cleanup contract runs
(memory capture, verdict recorder, file watches, PTYs) rather than leaking that state via
ad-hoc map deletion, checks out the preview branch, creates a `noWorktree` + `nonInteractive` `InternalSession`,
and runs `npm run dev` in the project dir (`startDevServer`, `:118`). Dev-server stdout is
scanned by `detectUrl`; the first URL flips status to `waiting` and emits `preview:url-detected`.
Each follow-up chat turn is a *fresh* print-mode process: `spawnPrintModeFollowUp()` (`:164`)
kills any in-flight process, rebuilds the prompt from chat history, spawns the runtime, and
re-wires output streaming. `probeSlashCommands()` (`:226`) spawns a throwaway Claude run only
to capture the `system/init` event's command list, then kills it. This class is owned by
`SessionManager`, not the app module (`session-manager.ts:62`); it lives here because it is
part of the app/preview surface.

**Mode switching.** `ModeSwitcher` (`mode-switcher.ts:26`) handles `app:switch-mode`
(`:61`): it persists `uiMode`, resets the project's session state (discover → kill interactive
and non-interactive sessions, restore base branch for `noWorktree` cases), prepares a
`PendingLaunchAction`, then **destroys and recreates the window** so the renderer reboots into
the new mode. The renderer drains the pending action via `app:consume-pending-launch` (`:48`).
It also owns `theme:changed`, which sets `nativeTheme.themeSource` and the window background.

**Auto-updater.** `setupAutoUpdater()` (`auto-updater.ts:203`) no-ops unless packaged (or
`MANIFOLD_FORCE_DEV_UPDATES=1`), enables auto-download/install-on-quit, wires `electron-updater`
events to `debugLog` + a `updater:status` broadcast, fires a startup check, and schedules an
hourly one. `checkForUpdates()` (`:176`) de-dupes concurrent checks and retries transient
failures (5xx, timeout, missing `latest-mac.yml`) on a `[5s, 15s, 60s]` backoff. Release notes
are fetched from the GitHub API and cached on success; transient failures (non-2xx, network error)
return a fallback without caching so the next call retries the live API (`getReleaseNotes`, `:127`).

## Key types and entry points

- `registerAppLifecycle(deps)` — `app-lifecycle.ts:32`. The only place Electron app events are bound.
- `createWindow(deps)` / `rebuildAppMenu(win, opts)` — `window-factory.ts:53` / `:135`.
- `registerIpcHandlers(deps)` — `ipc-handlers.ts:24`. Single fan-out for all `register*Handlers`; `IpcDependencies` is re-exported from `../ipc/types`.
- `DevServerManager` — `dev-server-manager.ts:16`. Methods: `startDevServerSession`, `startDevServer`, `spawnPrintModeFollowUp`, `probeSlashCommands`.
- `ModeSwitcher` — `mode-switcher.ts:26`. `register(createWindow, getMainWindow, setMainWindow)` binds `app:switch-mode`, `theme:changed`, `app:consume-pending-launch`.
- `setupAutoUpdater()` / `checkForUpdates(reason)` / `getReleaseNotes(version)` — `auto-updater.ts:203` / `:176` / `:127`.
- `startLocalRendererServer(rootDir)` → `LocalRendererServer` — `local-renderer-server.ts:38`.
- `loadShellPath()` — `shell-path.ts:12`. `configureDevProfilePaths(app)` — `dev-profile.ts:32`.
- `PowerManager` — `power-manager.ts:3`. `debugLog()` / `flushDebugLogSync()` — `debug-log.ts:88` / `:97`.

## Interactions

- **Session** (`src/main/session`): `index.ts` constructs `SessionManager` and passes it nearly everywhere. `SessionManager` in turn instantiates `DevServerManager` from this module (`session-manager.ts:62`) and exposes `startDevServerSession()` that `ModeSwitcher` calls (`mode-switcher.ts:124`).
- **IPC** (`src/main/ipc`): `ipc-handlers.ts` is the registration hub; `IpcDependencies` (`../ipc/types`) is the shared dependency contract that `index.ts` populates as `ipcDeps`.
- **Renderer / preload**: the menu (`app-menu.ts`), updater (`broadcastStatus`), and dev server (`preview:url-detected`, `agent:slash-commands`) all communicate by `webContents.send`. The window factory loads the preload from `../preload/index.js`.
- **Stores / managers**: `index.ts` is the single construction site for `SettingsStore`, `ProjectRegistry`, `WorktreeManager`, `PtyPool`, file/tree watchers, workspace, memory, verdict, and plugin managers.
- **Plugins** (`src/main/plugins`): `registerWebviewSchemePrivileged()` must run before `app.whenReady()` (`index.ts:179`); `installWebviewProtocol()` and `installFrameSourceReferrer()` — which re-attaches the loopback renderer origin as the `Referer` on plugin-webview embeds of `frameSources` origins, because `manifold-webview://` documents send none and YouTube rejects refererless embeds — run inside `whenReady` (`app-lifecycle.ts:53`, `:57`).
- **Agent / PTY** (`src/main/agent`): `DevServerManager` uses `PtyPool`, `getRuntimeById`, `buildSimpleRuntimeCommand`, and `extractSlashCommands` to run dev servers and print-mode turns.

## Invariants & gotchas

- **Side-effect imports run before everything.** `loadShellPath()` and `configureDevProfilePaths()` execute at the top of `index.ts` (`:6`), before the manager imports — order is load-bearing, not stylistic. `delete process.env.CLAUDECODE` (`index.ts:11`) is what lets nested Claude agents spawn at all.
- **IPC handlers register once; windows don't.** The `ipcHandlersRegistered` guard (`window-factory.ts:100`) prevents duplicate `ipcMain.handle` registrations when mode switching recreates the window.
- **Mode switch destroys the window.** `app:switch-mode` calls `win.destroy()` then `createWindow()` (`mode-switcher.ts:75`); state that must survive the switch is passed through the `PendingLaunchAction` returned by `app:consume-pending-launch`, not held in the renderer.
- **`debugLog` is on a hot path — never make it synchronous.** It is called once per PTY chunk; an earlier `appendFileSync` implementation hung the main thread at ~3ms/call once `debug.log` grew large. Lines are coalesced and appended async, with only `flushSync()` (on quit) writing synchronously (`debug-log.ts:26`).
- **Auto-updater is no-op in dev.** Without `app.isPackaged` (or `MANIFOLD_FORCE_DEV_UPDATES=1`) `setupAutoUpdater` returns early (`auto-updater.ts:207`); don't expect update events when running unpacked.
- **`loadShellPath` must not source `.zshrc`.** Interactive rc files hang when launched from Spotlight with no TTY; it asks the login shell for `$PATH` only, then appends known binary dirs as a fallback (`shell-path.ts:9`).
- **Local renderer server is production-only and best-effort.** It exists so embed providers (YouTube, Vimeo, …) accept a real `http://127.0.0.1` origin instead of `file://`; if it fails to bind, the window falls back to `file://` and those embeds will fail (`window-factory.ts:142`).
- **Webviews are restricted to localhost.** `will-attach-webview` rejects any non-localhost `src` (host-anchored regex) and strips the preload (`window-factory.ts:77`); GUEST_VIEW `ERR_ABORTED (-3)` noise is deliberately suppressed via the `console.error` monkey-patch at `window-factory.ts:14`.
