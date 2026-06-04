# Manifold Plugins — Review Follow-ups

From the final holistic review of the plugin system (Phases 0–1e). The two must-fixes (C1 path traversal, I4 CSP `frame-src`) were addressed in commit `82530c2`. The items below are **dormant under today's first-party, serial, single-plugin usage** and should be resolved **before enabling third-party plugins** (or before shipping many built-in plugins).

## Before third-party plugins

- **I2 — Per-plugin gated-API race (`src/plugin-host/index.ts` + `activator.ts` + `require-interceptor.ts`).** The require interceptor returns a module-global `currentApi` set synchronously before `require(pluginMain)`. If two plugins activate concurrently and one does a *lazy* `require('manifold')` (inside a callback after an `await`), it could observe the other plugin's gated API (capability confusion). Safe today: activation is triggered serially and the sample requires `manifold` at top-level (captured during the synchronous load). **Fix:** snapshot the API per loading module (resolve the interceptor against the currently-loading module), or serialize `$activate` with a promise queue in the `Activator`.

- **I3 — No deactivate/close path → host-side listener leak; `ExtensionHost.dispose()` is dead code.** Closing a plugin dock panel never notifies main, so `resolveView` re-runs on reopen and `WorkspaceContext`/webview listeners accumulate. The utilityProcess is never killed (dies with the app). **Fix:** add a `plugins:close-view` IPC fired from `PluginViewPanel`'s effect cleanup → host `disposeView(viewId)` (clear listeners + dispose the provider's subscriptions); wire app-quit → `pluginManager` teardown → `host.dispose()`.

- **M5 — Global, last-writer-wins command & view registries (`command-registry.ts`, `window-api.ts`, renderer `contribution-registry.ts`).** Command/view ids are global; a later plugin silently overwrites an earlier registrant. **Fix:** require contributed ids to be namespaced by plugin id (e.g. start with `${pluginId}.`) and warn on collision.

## Cleanups (any time)

- **M6 — Dead `Activator.makeApi` param.** `activator.ts` constructs/stores/`void`s `makeApi` and never uses it; `index.ts` passes `() => currentApi as never` only to satisfy the constructor. The API is wired via the require interceptor, not `makeApi`. Drop the param (update `activator.test.ts`).
- **M7 — `getPanelComponents()` snapshot.** `dock-panels.tsx` spreads `...getPanelComponents()` at module load; it only ever returns the 4 internal components (plugin panels render via the static `pluginView` entry). The dynamic-looking spread implies a liveness that doesn't exist — a comment or direct `INTERNAL_PANELS` use would be clearer.
- **M8 — `as DockPanelId` cast on plugin ids** (`launcher-modules.ts`, `ModuleLauncher.tsx`). Documented + currently safe (plugin launcher items open via `onOpenPluginView`, bypassing `LAUNCHER_MODULE_IDS`/`PANEL_IDS`). Revisit when widening `DockPanelId`/the launcher types for plugins.

## Verification still owed (Electron-only; not runnable in CI here)

Dev smokes for the whole system — run `npm run dev` and confirm in a real window:
- "+ Apps" lists the built-in modules + **Hello (plugin)**.
- Hello panel renders (validates the I4 `frame-src 'self'` fix for the `srcdoc` iframe); **Ping** round-trips; the **+1 counter persists across reload** (storage); **Active project** shows/updates on project switch (workspace).
- `~/.manifold/debug.log` shows `[plugins] discovered N plugin(s)` and no host crash.

## Held / packaging
- `extraResources` for `resources/plugins` in `package.json` build config (needed so built-in plugins ship in packaged `.dmg`s; dev works without it).
- `.gitignore` ignores `out/`, so `resources/plugins/hello/out/plugin.js` is force-added. Add a negation like `!resources/plugins/*/out/` before there are many built-in plugins.

## VS Code shim — before running real (unmodified) extensions
- **Synchronous state/config reads.** `vscode.Memento.get`, `WorkspaceConfiguration.get`/`has` are synchronous in the real API, but the shim returns Promises (reads cross the RPC boundary). Real extensions call these without `await` (`if (config.get('x'))`, arithmetic on a returned number), so they silently misbehave. Fix before third-party extensions: preload the plugin's storage + config into an in-memory snapshot at activation (await once), expose synchronous `get`, and write through `update` asynchronously. Requires a `$getAll(pluginId)` on HOST_STORAGE/HOST_CONFIG and an async context-build step in the loader. (Phase A fixtures await, so current validation is unaffected.)
