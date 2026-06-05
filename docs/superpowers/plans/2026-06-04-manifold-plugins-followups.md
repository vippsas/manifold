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

## Held / packaging — ✅ RESOLVED (built-in plugins pipeline)
Both held items were resolved by the "built-in plugins as first-class" work (plan `2026-06-04-manifold-builtin-plugins-pipeline.md`):
- ✅ `extraResources` now ships `resources/plugins` → `plugins` (commit `f1cda68`), landing at `process.resourcesPath/plugins` where `getBundledPluginsDir()` reads in a packaged app.
- ✅ The `.gitignore` `out/` force-add problem is gone: built-in plugins are now authored in TypeScript under `src/` and compiled by `scripts/build-plugins.mjs` (run in `build`/`predev`/`pretest`/`predist`), so `out/` stays an ignored build artifact (no force-add). `hello` was converted to `src/` to dogfood it; `hello-vscode` remains a committed prebuilt fixture (it represents an unmodified external `.vsix` and B2 loads it from disk — intentionally not built from `src`).

### Owed verification (Electron-only; not runnable in CI here)
- **Packaging proof:** `npx electron-builder --dir` (unpacked, no sign/notarize), then confirm `dist/mac*/Manifold.app/Contents/Resources/plugins/hello/out/plugin.js` exists — proves built-ins ride a packaged build. (Needs a full app build + native rebuild; not run as part of the pipeline tasks.)
- **Dev smoke:** `npm run dev` → `~/.manifold/debug.log` shows discovery of the built-in plugins (now built from `src/`), no skip errors.

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

## Phase C1 — webview via manifold-webview scheme + nonce CSP (✅ shipped)
Fixes the live bug where the plugin panel's inline `<script>` was blocked by the app's `script-src 'self'` (a `srcdoc` iframe inherits the parent CSP). Plugin webview HTML is now served from a privileged `manifold-webview://view/<id>?v=<n>` origin (`src/main/plugins/webview-protocol.ts`) with a fresh **per-serve nonce CSP** (`default-src 'none'; script-src 'nonce-…'; style-src 'unsafe-inline'; …`), nonce-injected into the plugin's `<script>` tags. `PluginViewPanel` loads from that scheme (no more `srcDoc`) and buffers host→iframe messages until the iframe's `onLoad`. The iframe stays `sandbox="allow-scripts"` (opaque origin). The vscode-shim `window.registerWebviewViewProvider` now delegates to the real host impl.

Automated gates: 666 tests green; typecheck node 16 / web 37 / plugins 0; `npm run build` produces the host bundle + built-in plugin out. Dev-smoke (Electron-only) — confirm in **+ Apps → Hello (plugin)**: the **+1 button increments**, active project + greeting updates arrive, and there is **no** `about:srcdoc … script-src` CSP error. _Result: pending user confirmation._

Remaining C-phase: **C1b** `vscode.window.createWebviewPanel` (programmatic panels — needs a host→renderer open-panel channel); **C2** TreeView/`TreeDataProvider` + view containers; **C3** QuickPick/InputBox; **C4** StatusBar/withProgress/OutputChannel.

## Phase C2 — TreeView (✅ shipped, plan `2026-06-05-…-phaseC2-treeview.md`)
A functional, lazily-loaded native tree for plugins. `manifold.window.registerTreeDataProvider`/`createTreeView` (+ vscode-shim delegation). Core is the **element-handle protocol**: the host `TreeRegistry` keeps a per-view `nodeId → element` map, calls `getChildren`/`getTreeItem` on demand, and serializes `TreeItem`s (label/collapsibleState/id/description/tooltip/icon/command) to the renderer; `onDidChangeTreeData` → `plugins:tree-refresh`. Rendered by a native `PluginTreeViewPanel`/`PluginTree` (lazy expand-on-demand with a children cache + refresh-race generation guard + load-error handling + `collapsibleState:'expanded'` auto-expand cascade); node click runs `TreeItem.command` via `plugins:execute-command`. Launcher routes `kind:'tree'` contributions to the tree panel; VS Code `contributes.views` map to `type:'tree'` by default. Sample: `resources/plugins/hello-tree` (counter node click→increment→refresh + a lazy Fruits group).

Automated gates: 684 tests green; typecheck node 16 / web 37 / plugins 0; `npm run build` builds host + `hello`/`hello-tree`. Dev-smoke (Electron-only): open **+ Apps → Hello Tree** → expand **Fruits** (lazy children load), click **Counter: N** (increments + tree refreshes). _Result: pending user confirmation._

Remaining: **C2b** view-containers (activity-bar grouping), context menus (`contextValue` + `view/item/context`), inline actions, rich/file icons, reveal/selection. **C3** QuickPick/InputBox. **C4** StatusBar/withProgress/OutputChannel. **D** auth (Entra) + `FileSystemProvider` + the resources API — still required before `vscode-azurestorage`/`azureresourcegroups` actually function.

## Phase C3 — UI primitives (✅ shipped)

Native + vscode-shim `showInformationMessage`/`showWarningMessage`/`showErrorMessage`/`showQuickPick`/`showInputBox` all flow over a unified **HOST_UI request→response broker**: the plugin host sends a `plugins:ui-request` IPC with a typed payload (`showMessage` / `showQuickPick` / `showInputBox`), blocks on a `Promise` keyed by a `reqId`, and the renderer resolves it via `plugins:ui-response` once the user acts. The legacy `HOST_MESSAGES` channel (one-way fire-and-forget toasts) is retired; all UI calls are now two-way. The vscode-shim `window.show*Message`/`showQuickPick`/`showInputBox` methods delegate to the same host-side broker.

Renderer side: `PluginUiHost` component mounts in the app shell and handles the three request types:
- **showMessage** → a toast notification (`showInformationMessage` / `showWarningMessage` / `showErrorMessage`) with zero or more action buttons; resolves with the clicked button label or `undefined` (dismissed).
- **showQuickPick** → a `QuickPick` overlay (filterable list, arrow+Enter navigation, Escape = cancel); accepts `string[]` or `QuickPickItem[]`; resolves with the selected item or `undefined`.
- **showInputBox** → an `InputBox` overlay (prompt, placeholder, optional `validateInput`); resolves with the entered string or `undefined` (cancelled).

`InputBoxOptions` / `QuickPickOptions` / `QuickPickItem` are defined in `src/shared/plugins/ui.ts` and exposed via `ManifoldApi`/`api-types.ts`.

**Demo command** (`manifold.hello.demoUi`) added to `resources/plugins/hello`: runs the three primitives in sequence — input box → quick pick of 3 colors → info toast with two buttons — and returns `name:color:buttonOrDismissed`.

**Automated gates:** 60/60 vitest (plugins) green; typecheck plugins 0; typecheck node 16; `npm run build:plugins` builds `hello` + `hello-tree`.

**Dev-smoke (Electron-only, pending user confirmation):** run the `hello` plugin's `manifold.hello.demoUi` command (via the panel or `plugins:execute-command`) → an input box prompts for a name → a quick pick of Red/Green/Blue appears (type to filter, arrow/Enter to select) → an info toast with **Nice** and **Meh** buttons resolves to the clicked button label. The return value is logged as `name:color:buttonOrDismissed`.

**Remaining:**
- **C3b** — multi-select QuickPick (`canPickMany`); `InputBox` `validateInput` callback; `QuickPickItem` detail/alwaysShow/separator support.
- **C4** — `StatusBarItem` (`createStatusBarItem`), `withProgress` (notification progress), `OutputChannel` (`createOutputChannel`).
- **C2b** — view-containers, context menus, inline actions (deferred from C2).

## Plugin enable/disable from Settings (✅ shipped, plan `2026-06-05-…-enable-disable.md`)
A persisted `disabledPlugins: string[]` setting; `PluginManager.isEnabled/setEnabled` filters disabled plugins out of `listViewContributions()` and guards the activate/openView/openTreeView/treeGetChildren paths. `plugins:list` is enriched with `enabled`; `plugins:set-enabled` persists + pushes `plugins:contributions-changed`, which the renderer uses to re-fetch contributions and re-seed the registry so the **+ Apps** launcher updates live. The Settings → Plugins tab lists ALL plugins with an enable/disable toggle (config fields shown only when enabled + contributed).
Gates: 718 tests; typecheck node 16 / web 37 / plugins 0; build OK. Dev-smoke (Electron-only): Settings → Plugins → toggle a plugin off → it disappears from + Apps live; toggle on → reappears; restart → persisted.
**Known limitation:** deactivation isn't wired (followup I3), so disabling a plugin that's already activated this session removes it from the launcher + blocks new activation immediately, but the running instance lives until app restart.
