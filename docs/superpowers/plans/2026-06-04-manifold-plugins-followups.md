# Manifold Plugins — Review Follow-ups

From the final holistic review of the plugin system (Phases 0–1e). The two must-fixes (C1 path traversal, I4 CSP `frame-src`) were addressed in commit `82530c2`. The items below are **dormant under today's first-party, serial, single-plugin usage** and should be resolved **before enabling third-party plugins** (or before shipping many built-in plugins).

## Before third-party plugins

- **I2 — Per-plugin gated-API race.** ✅ **CLOSED** (VS Code shim work, commit `905fd01`). The module-global `currentApi` was removed; `require-interceptor.ts` now resolves `manifold`/`vscode` per requesting module by the requester's file path (`registerPluginApis(root, frame)` + `resolvePluginModule`), so lazy requires can no longer observe another plugin's API. Boundary case (`/plugins/ab` ≠ `/plugins/a`) is tested.

- **I3 — No deactivate/close path → host-side listener leak; `ExtensionHost.dispose()` is dead code.** Closing a plugin dock panel never notifies main, so `resolveView` re-runs on reopen and `WorkspaceContext`/webview listeners accumulate. The utilityProcess is never killed (dies with the app). **Fix:** add a `plugins:close-view` IPC fired from `PluginViewPanel`'s effect cleanup → host `disposeView(viewId)` (clear listeners + dispose the provider's subscriptions); wire app-quit → `pluginManager` teardown → `host.dispose()`. The vscode shim wrapper already bridges its ExtensionContext.subscriptions into the Activator's disposal list at activate-time (snapshot), so wiring deactivation here will dispose vscode plugins too; revisit if an extension registers disposables lazily after activate. **Also unregister the require-interceptor frame on deactivation** — `index.ts`'s `$deactivate` has a TODO: it should call `unregisterPluginApis(root)` (needs an id→root map) so a deactivated plugin's `require('manifold'|'vscode')` no longer resolves.

- **M5 — Global, last-writer-wins registries.** ◑ **PARTIALLY CLOSED.** The *command* registry (`command-registry.ts`) now records ownership and is first-writer-wins: a cross-owner id collision is rejected and reported via `onCollision` → `debugLog` (commit `74509ec`, owner threaded from `ExtensionHost.activatingPluginId`). **Still open:** the *view* registries (`window-api.ts`, renderer `contribution-registry.ts`) remain last-writer-wins for contributed view ids — apply the same owner/collision discipline before third-party plugins.

## Cleanups (any time)

- **M6 — Dead `Activator.makeApi` param.** ✅ **CLOSED** (VS Code shim work, commit `026a2aa`). The `makeApi` constructor param and `MakeApi` type were dropped; the `Activator` now takes a single `loadModule`, and the API is wired entirely via the require interceptor. `activator.test.ts` updated.
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
- **Per-API capability model for the `vscode` surface.** VS Code extensions currently get *ungated* access to `commands`/`window.show*Message`/`storage`/`config` (the shim builds its namespace directly, bypassing the `buildGatedApi` capability gate the `manifold` kind uses). This is the intended command-only Phase A scope — all plugins are first-party and share one `utilityProcess` (the trust boundary is the process). Before running untrusted third-party extensions: define which `vscode` APIs require which capability/permission, gate them, and isolate plugins (separate host processes or per-plugin gating). Tracked in detail as Phase C/D in `2026-06-04-manifold-plugins-vscode-shim.md`.

## VS Code shim — Phase A/B dev smoke (owed; Electron-only)

Run `npm run build` then `npm run dev` and confirm in a real window (none of this is runnable in CI):

- `~/.manifold/debug.log` shows `[plugins] discovered N plugin(s)` with N including BOTH `manifold.hello` and `manifold.hello-vscode`, and no host crash / no `VscodeShimError` during discovery or activation.
- Trigger the VS Code extension's command `helloVscode.hello` (via the command palette/dev trigger, or `pluginManager.executeContributedCommand('helloVscode.hello', [])` on the dev IPC path used in earlier phase smokes).
- Confirm the log shows `[plugins] message(info): Hello from a VS Code extension (greet #1)` (proves the unmodified extension's `require('vscode')` → shim → `window.showInformationMessage` → HOST_MESSAGES path).
- Re-run the command (or relaunch) and confirm the greet count INCREMENTS — proving `context.globalState` persists through HOST_STORAGE (the `global:greetCount` key).
- If a `VscodeShimError: vscode.<api> is not yet implemented` appears, it names exactly which deferred API a future phase must implement — record it here.

Result (fill in when run): _pending_
