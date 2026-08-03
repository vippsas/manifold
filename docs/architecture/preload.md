---
description: The contextBridge preload that exposes a single whitelisted window.electronAPI surface to the renderer and keeps Node/fs out of the web context.
covers: [src/preload]
updated: 2026-08-03
owner: see .github/CODEOWNERS
---

# Preload bridge — the renderer's only door into the main process

The preload script runs in Electron's isolated preload world: it has Node/Electron
access, but the renderer does not. Its single job is to publish a small, frozen
`window.electronAPI` object — `invoke`, `send`, `on`, `getPathForFile` — guarded by
three hard-coded channel whitelists. Every renderer → main and main → renderer message
passes through one of those four methods, so the set of allowed channels *is* the IPC
contract surface. There is no `require`, no `fs`, no `ipcRenderer` leaked to the page.

## Covered code

- `src/preload/index.ts` — the entire bridge: the `ALLOWED_INVOKE_CHANNELS` / `ALLOWED_SEND_CHANNELS` / `ALLOWED_LISTEN_CHANNELS` whitelists, the three guard predicates, the `electronAPI` object, and the `contextBridge.exposeInMainWorld` call.
- `src/shared/electron-api.d.ts` — the `ElectronAPI` interface and the `declare global { interface Window { electronAPI } }` augmentation that types `window.electronAPI` everywhere in the renderer (not part of `src/preload`, but the typed half of the same contract).

That is the whole subsystem — one 228-line module plus a 14-line type declaration.

## How it works

The module imports only `contextBridge`, `ipcRenderer`, and `webUtils` from `electron`
(`src/preload/index.ts:1`) — nothing from `fs`, `path`, or `child_process`. Three
`as const` arrays declare the permitted channels:

- `ALLOWED_INVOKE_CHANNELS` (`src/preload/index.ts:3`) — 127 request/response channels, the `<namespace>:<verb>` names the main-process IPC handlers register (`projects:*`, `agent:*`, `files:*`, `diff:*`, `git:*` including `git:has-uncommitted-changes` and `git:workspace-status`, `settings:*`, `memory:*`, `search:*`, `workspace:*`, `simple:*`, `plugins:*`, and more).
- `ALLOWED_SEND_CHANNELS` (`src/preload/index.ts:140`) — exactly one fire-and-forget channel, `theme:changed`.
- `ALLOWED_LISTEN_CHANNELS` (`src/preload/index.ts:144`) — 27 main → renderer push channels (`agent:output`, `agent:status`, `agent:sessions-changed`, `files:changed`, `settings:changed`, `updater:status`, `command:run`, `plugins:webview-*`, `simple:chat-message`, etc.). `command:run` is the single channel the native menu uses to invoke any command in the shared catalog (`src/shared/commands/catalog.ts`); the renderer's `useCommands` hook dispatches it.

Each array is paired with a TypeScript literal-union type derived from it
(`InvokeChannel`/`SendChannel`/`ListenChannel`, `src/preload/index.ts:178`) and a
type-guard predicate (`isAllowedInvokeChannel`, `isAllowedSendChannel`,
`isAllowedListenChannel`, `src/preload/index.ts:182`) that does a runtime
`includes()` check and narrows the channel to the union.

The exposed object, `electronAPI` (`src/preload/index.ts:196`), has four methods:

- `invoke(channel, ...args)` (`:197`) — rejects with `IPC invoke channel not allowed: <channel>` if the channel is not whitelisted, otherwise forwards to `ipcRenderer.invoke` and returns its `Promise`.
- `send(channel, ...args)` (`:204`) — silently drops the call unless the channel is in the send whitelist; otherwise calls `ipcRenderer.send`.
- `on(channel, callback)` (`:210`) — for a disallowed channel returns a no-op unsubscriber (`() => {}`) and never registers anything. For an allowed channel it wraps the caller's callback so the raw `Electron.IpcRendererEvent` is stripped and only the payload args reach the renderer (`:214`), registers it with `ipcRenderer.on`, and returns a disposer that calls `ipcRenderer.removeListener` (`:219`).
- `getPathForFile(file)` (`:223`) — wraps `webUtils.getPathForFile`, the supported way to recover the absolute path of a dropped/selected `File` (Electron removed `File.path`).

Finally `contextBridge.exposeInMainWorld('electronAPI', electronAPI)`
(`src/preload/index.ts:228`) copies a structured clone of this object onto the
renderer's `window`. Because `contextIsolation` is on, the renderer receives only this
proxied surface — it cannot reach `ipcRenderer`, the channel arrays, or any Electron
module.

**Why the renderer can't touch Node/fs.** The isolation is enforced by the
`BrowserWindow` `webPreferences` in `src/main/app/window-factory.ts:67`:
`contextIsolation: true`, `nodeIntegration: false`, `preload` pointing at the built
`../preload/index.js`. The preload runs in a separate JS world from page scripts and
hands across only what `exposeInMainWorld` publishes. Filesystem reads/writes, git, and
process spawning therefore happen exclusively in the main process behind channels like
`files:read` / `files:write` (`src/preload/index.ts:35`) — the renderer asks, it never
acts. The same factory also hardens any `<webview>`: on `will-attach-webview` it deletes
the preload, forces `nodeIntegration: false` / `contextIsolation: true`, and blocks any
non-localhost `src` (`src/main/app/window-factory.ts:77`).

## Key types and entry points

- `electronAPI` object — `src/preload/index.ts:196`. The runtime surface bridged to `window`.
- `ElectronAPI` interface — `src/shared/electron-api.d.ts:1`. The compile-time shape: `invoke`, `send`, `on`, `getPathForFile`. Note the typed methods take a plain `channel: string` — the channel *names* are not encoded in the type, so an unknown channel is a runtime rejection, not a compile error.
- `Window.electronAPI` augmentation — `src/shared/electron-api.d.ts:8`. Makes `window.electronAPI` resolve across the renderer (66 renderer files reference it).
- `ALLOWED_INVOKE_CHANNELS` / `ALLOWED_SEND_CHANNELS` / `ALLOWED_LISTEN_CHANNELS` — `src/preload/index.ts:3` / `:140` / `:144`. The authoritative whitelists; adding a new IPC channel means appending here as well as wiring the handler.

## Interactions

- **Renderer** (`src/renderer`): every call into main goes through `window.electronAPI.invoke(...)`, every subscription through `window.electronAPI.on(...)` (e.g. `App.tsx:144` invokes `git:ahead-behind`; `PluginViewPanel.tsx:31` listens on `plugins:webview-html`). Renderer tests stub `window.electronAPI` directly.
- **Main IPC handlers** (`src/main/ipc/*`): the other end of every `invoke` channel. `ipcMain.handle('files:read', …)`, `agent:spawn` → `SessionManager.createSession`, `agent:configure` → `SessionManager.configureSession`, etc. The whitelist names must match the handler registrations one-for-one.
- **Main → renderer pushes**: handlers and managers call `webContents.send('agent:output', …)`, `webContents.send('settings:changed', …)`, `app-menu.ts` sends `command:run` for catalog commands (plus bespoke `show-update-log`/`show-update-check`), etc. Those channels must appear in `ALLOWED_LISTEN_CHANNELS` or the renderer's `on` silently ignores them.
- **Window factory** (`src/main/app/window-factory.ts:67`): sets `preload`, `contextIsolation`, `nodeIntegration` — the configuration that makes this bridge the *only* path between the two worlds.
- **Session subsystem** (`docs/architecture/session.md`): the `agent:*` invoke channels and the `agent:output`/`agent:status`/`agent:sessions-changed` listen channels are how the renderer drives and observes agent sessions.

## Invariants & gotchas

- **The whitelist is the contract.** A channel that is not in the matching array is unreachable: `invoke` returns a rejected promise (`src/preload/index.ts:199`), `send` is a no-op (`:205`), and `on` returns a no-op disposer without subscribing (`:212`). Add a channel in **both** places — the preload array and the main-process handler — or the call fails at runtime with no type error.
- **`on` always returns a disposer.** Even the disallowed-channel branch returns `() => {}` (`src/preload/index.ts:212`), so renderer cleanup code (`return off`) is safe to call unconditionally.
- **The `IpcRendererEvent` is intentionally hidden.** `on`'s wrapper forwards only `...args`, never the event (`src/preload/index.ts:214`), so the renderer cannot reach `event.sender`, `event.ports`, or other Electron internals.
- **Types don't constrain channel names.** `ElectronAPI.invoke` takes `channel: string` (`src/shared/electron-api.d.ts:2`); only the literal-union types *inside* the preload (`src/preload/index.ts:178`) know the real names, and they never cross the bridge. A typo in a renderer channel string compiles fine and fails at runtime.
- **`sandbox: false`, not `true`.** The renderer is unsandboxed (`src/main/app/window-factory.ts:72`); isolation here rests on `contextIsolation` + `nodeIntegration: false` plus this whitelist, not on the OS sandbox.
- **One module, no exports.** `src/preload/index.ts` exposes its surface as a side effect of `exposeInMainWorld`; it exports nothing. The only importable artifact is the ambient `ElectronAPI`/`Window` declaration in `src/shared/electron-api.d.ts`.
