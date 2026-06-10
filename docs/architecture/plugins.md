---
description: How Manifold's main process discovers, loads, gates, and tears down plugins — the host side that forks the extension-host utility process and enforces capabilities.
covers: [src/main/plugins, src/plugin-host]
updated: 2026-06-10
owner: see .github/CODEOWNERS
---

# Plugins (host) — discovery, loading, capability gating

The plugin *host* is the main-process machinery that finds plugins on disk, forks a
sandboxed extension-host utility process to run their code, and brokers every call
between that process and the rest of the app. It is also the trust boundary: plugins
declare *capabilities* in their manifest, and the host decides which API namespaces a
plugin may touch — including two privileged namespaces (`agent:control`, `lm`) that are
restricted to built-in plugins no matter what their manifest claims.

The API surface plugin authors consume from inside their code (`manifold.*` / `vscode.*`)
is documented separately in [Authoring Built-in Manifold Plugins](../plugins/authoring.md).
This page is about the host that loads and gates them; it references the extension-host
process (`src/plugin-host`) where that is where loading/gating actually executes.

## Covered code

- `src/main/plugins/plugin-manager.ts` — `PluginManager`, the main-process façade: scan, enable/disable, config, activation, view/tree/webview routing.
- `src/main/plugins/scanner.ts` — `scanPluginDir()`: reads each plugin folder's `package.json` and builds `PluginDescriptor`s.
- `src/main/plugins/plugin-paths.ts` — `getBundledPluginsDir()` (built-in) and `getUserPluginsDir()` (user).
- `src/main/plugins/manifest.ts` / `vscode-manifest.ts` — `parseManifest()` / `parseVscodeManifest()`: validate the manifest and capabilities.
- `src/main/plugins/extension-host.ts` — `ExtensionHost`: forks `plugin-host.js`, registers the main-side RPC services, owns disposal.
- `src/main/plugins/command-registry.ts` / `host-commands-service.ts` — command ownership (`CommandRegistry`) and its RPC service.
- `src/main/plugins/agent-control-service.ts` / `lm-service.ts` — the privileged main-side services behind `agent:control` / `lm`.
- `src/main/plugins/plugin-storage-store.ts` — per-plugin key/value JSON storage with path-escape defense.
- `src/main/plugins/webview-protocol.ts` / `webview-content-store.ts` — the `manifold-webview://` scheme, nonce-CSP injection, and the HTML store.
- `src/main/plugins/ui-broker.ts` — `UiRequestBroker`: bridges host UI prompts to the renderer and awaits the reply.

The extension-host process itself (`src/plugin-host/`) is the peer of this code: `index.ts` wires the `require('manifold')` interceptor (`require-interceptor.ts`), the `Activator` lifecycle (`activator.ts`), and capability enforcement (`gated-api.ts`). It is cited here where the host-side flow crosses into it.

## How it works

`PluginManager` is constructed once at startup with the storage path, settings store,
session manager, and git ops (`plugin-manager.ts:47`), and `app/index.ts` calls
`scan()` immediately after (`app/index.ts:116`). The manager builds an `ExtensionHost`
in its constructor, injecting the two privileged services up front:
`createAgentControlService(sessionManager)` and `createLmService(sessionManager, gitOps)`
(`plugin-manager.ts:53`).

**Discover.** `scan()` reads two roots — `getBundledPluginsDir()` (origin `'builtin'`,
`resources/plugins` or `process.resourcesPath/plugins` when packaged) and
`getUserPluginsDir()` (origin `'user'`, `<storage>/plugins`) — and concatenates the
results (`plugin-manager.ts:92`, `plugin-paths.ts:7`). For each subfolder with a
`package.json`, `scanPluginDir()` (`scanner.ts:13`) JSON-parses it, picks
`parseVscodeManifest` when `engines.vscode` is a string and `parseManifest` otherwise,
and emits a `PluginDescriptor` with `id = "${publisher}.${name}"`, the `origin`, and
`kind` (`'vscode'` | `'manifold'`). Malformed manifests are collected as errors and
`debugLog`ged, never thrown (`plugin-manager.ts:96`).

`parseManifest()` (`manifest.ts:17`) requires `name`/`publisher`/`version` and
`engines.manifold`, and constrains `name`/`publisher` to `/^[a-z0-9][a-z0-9-]*$/` so the
id can never contain a path separator or `..` (the id becomes a storage filename,
`manifest.ts:29`). Capabilities are validated *strictly*: a value not in
`CAPABILITIES` rejects the whole manifest, so a typo can't silently escape gating
(`manifest.ts:44`). `parseVscodeManifest()` is the Phase-A subset — it maps a VS Code
extension's `main`, `activationEvents`, `commands`, and tree `views` and never grants
`capabilities` (`vscode-manifest.ts:13`).

**Activate.** `PluginManager.activate(id)` short-circuits unless the plugin exists, has a
`main`, and is enabled (`plugin-manager.ts:110`), then calls `ExtensionHost.activate()`
with an `ActivationTarget` carrying `{ id, root, main, kind, capabilities, origin }`
(`plugin-manager.ts:113`). `ExtensionHost.ensure()` lazily forks the utility process
`plugin-host.js` (sibling of the main bundle, `extension-host.ts:45`) and registers every
main-side RPC service before the first `$activate` round-trips. In the child,
`installPluginRequire()` patches Node's `Module._load` (`plugin-host/index.ts:42`,
`require-interceptor.ts:30`); the `Activator` then `require()`s the entry module
(`plugin-host/index.ts:77`, `activator.ts:21`) and calls its `activate(context)` exactly
once per id (`activator.ts:19` guards re-activation).

**The `require('manifold')` interceptor.** Before loading a plugin's entry module the
host builds that plugin's API frame and registers it keyed by the plugin *root*
(`registerPluginApis(root, …)`, `plugin-host/index.ts:75`). The patched loader resolves
`require('manifold')` / `require('vscode')` by walking the registered frames and matching
the *requiring file's* path against each root (`resolvePluginModule`,
`require-interceptor.ts:17`) — so each plugin sees only the API instance built for it, and
non-plugin requires fall through to the original `Module._load`. There is no `manifold`
package on disk; the name resolves purely through this interceptor.

**Capability gating.** The frame for a manifold plugin is `buildGatedApi(capabilities,
origin, …)` (`plugin-host/index.ts:68`, `gated-api.ts:27`). `commands` and `window` are
always available; `storage`, `workspace`, `configuration`, `agents`, and `lm` are lazy
getters that call `requireCap()` on first access. `requireCap` throws `CapabilityError`
when the capability isn't declared, and `RestrictedCapabilityError` when a built-in-only
capability is requested by a non-built-in plugin (`gated-api.ts:34`). The built-in-only
set is `BUILTIN_ONLY_CAPABILITIES = ['agent:control', 'lm']` (`shared/plugins/manifest.ts:14`),
so even a user plugin that declares `agent:control` in its manifest is denied at the
getter because its `origin !== 'builtin'`. These two namespaces are backed in the main
process by `AgentControlService` (drives a session's agent for one turn,
`agent-control-service.ts:110`) and `LmService` (one-shot generation via the active
session's runtime, `lm-service.ts:19`) — exactly the powers that warrant the restriction.

**Commands.** Command ids are owned end-to-end. A plugin's `commands.registerCommand`
threads its `pluginId` to the host's `$registerCommand`, which calls
`CommandRegistry.register(id, owner, …)` (`host-commands-service.ts:24`). The registry is
first-writer-wins: a second plugin registering an existing id is logged and ignored, and
only the owner may unregister (`command-registry.ts:14`). Execution routes back to the
owning plugin's process via the `PLUGIN_COMMANDS` proxy.

**Views & webviews.** `listViewContributions()` flattens every *enabled* plugin's
`contributes.views` into renderer `PanelContribution`s (`plugin-manager.ts:106`,
`:20`). Opening a webview view calls `openView()` → `ExtensionHost.resolveView()`, which
activates the plugin then asks it to `$resolveView` (`extension-host.ts:106`). The plugin
sets HTML via the host's `$setHtml`, which writes the `webviewContentStore` and pushes a
`plugins:webview-html` event with a new version (`extension-host.ts:67`). The renderer
loads `manifold-webview://view/<id>?v=<n>`; `installWebviewProtocol()` serves it from the
store, injecting a **fresh per-request nonce CSP** and adding that nonce to every
`<script>` tag (`webview-protocol.ts:146`, `:37`). Tree views skip HTML entirely and pull
nodes through `treeGetChildren()` (`plugin-manager.ts:136`). Interactive prompts
(`window.showMessage` etc.) go through `UiRequestBroker`, which emits `plugins:ui-request`
and resolves when the renderer replies via `plugins:ui-response` (`ui-broker.ts:10`).

**Lifecycle / disposal.** The host process is forked lazily and recovers on death: an
`exit` or `error` event rejects every in-flight RPC and clears the `CommandRegistry`, then
nulls `child`/`endpoint` so the next call re-forks a clean host (`onHostDown`,
`extension-host.ts:52`). In the child, an uncaught exception is logged and exits the
process (so main can re-fork), while an unhandled rejection is only logged
(`plugin-host/index.ts:26`). `ExtensionHost.dispose()` flushes pending UI, rejects
pending RPCs, clears commands, and kills the child (`extension-host.ts`). The
`Activator.deactivate()` path runs the plugin's `deactivate()` and disposes its
`context.subscriptions` (`activator.ts:27`), and the host's `$deactivate` then
`unregisterPluginApis(root)` so the plugin's `require('manifold')` frame is removed too
(`plugin-host/index.ts:87`). Disabling a plugin (`setEnabled(id, false)`) fires this
deactivate path on the host, and `executeContributedCommand` refuses a command owned by a
disabled plugin (`extension-host.ts`, `plugin-manager.ts:63`).

## Key types and entry points

- `PluginManager` — `plugin-manager.ts:43`. Public surface: `scan`, `listPlugins`, `listViewContributions`, `isEnabled`/`setEnabled`, `getConfig`/`setConfig`, `activate`, `openView`/`openTreeView`, `treeGetChildren`, `executeContributedCommand`, `deliverWebviewMessage`, `setActiveContext`, `setMainWindow`.
- `ExtensionHost` — `extension-host.ts:24`. Owns the utility process, the RPC endpoint, the `CommandRegistry`, the `UiRequestBroker`, and the privileged services.
- `PluginDescriptor` — `shared/plugins/manifest.ts:70`. `{ id, manifest, root, origin, kind }`, produced by the scanner.
- `ActivationTarget` — `plugin-host/activator.ts:5`. The `{ id, root, main, kind, capabilities, origin }` passed across the RPC boundary to activate a plugin.
- `Capability` / `CAPABILITIES` / `BUILTIN_ONLY_CAPABILITIES` — `shared/plugins/manifest.ts:7`, `:14`. The single source of truth for gating.
- `buildGatedApi()` — `plugin-host/gated-api.ts:27`. Wraps API factories in capability checks.
- `resolvePluginModule()` / `installPluginRequire()` — `plugin-host/require-interceptor.ts:17`, `:30`. The `require('manifold')` interceptor.

## Interactions

- **Extension-host process** (`src/plugin-host`): the peer that actually runs plugin code. `index.ts` wires the require interceptor, the `Activator`, `buildGatedApi`, and the per-namespace API factories (`storage-api`, `workspace-api`, `config-api`, `agents-api`, `lm-api`, plus the `vscode-shim` for `kind: 'vscode'`). The two sides talk over `RpcEndpoint` (`shared/plugins/rpc.ts:32`) across the utility-process message channel.
- **Session** (`src/main/session`): `AgentControlService` and `LmService` read live sessions via `SessionManager.getSession`/`getInternalSession`/`sendInput`; `setActiveContext` enriches the renderer's context with the session's `worktreePath` (`plugin-manager.ts:148`).
- **Git** (`src/main/git`): `LmService.sendRequest` calls `GitOperationsManager.aiGenerate` to do one-shot generation through the runtime (`lm-service.ts:37`).
- **Settings store** (`src/main/store`): enable/disable lives in `settings.disabledPlugins`; per-plugin config overrides live in `settings.pluginConfig` and merge over manifest defaults (`plugin-manager.ts:59`, `:69`).
- **IPC** (`src/main/ipc/plugin-handlers.ts`): `plugins:list`, `plugins:list-contributions`, `plugins:set-enabled`, `plugins:activate`, `plugins:execute-command`, `plugins:open-view`/`open-tree-view`, `plugins:tree-get-children`, `plugins:webview-to-host`, `plugins:set-active-context`, `plugins:get-config`/`set-config`, `plugins:ui-response`. The manager pushes `plugins:webview-html`, `plugins:webview-message`, `plugins:tree-refresh`, `plugins:ui-request`, and `plugins:contributions-changed` to the renderer through `setMainWindow`'s `send` (`plugin-manager.ts:120`).
- **Renderer** (`src/renderer/plugins`, `components/editor`): `PluginViewPanel` triggers `plugins:open-view` and listens for `plugins:webview-html`; `usePluginTree` drives tree views; `use-contributions` reloads the launcher on `plugins:contributions-changed`.

## Invariants & gotchas

- **`agent:control` and `lm` are built-in-only — enforced at the getter, not just the manifest.** Declaring them in a user plugin's manifest passes parse-time validation (they are valid capabilities) but throws `RestrictedCapabilityError` the moment the plugin touches `manifold.agents` / `manifold.lm` (`gated-api.ts:36`). The restriction keys on `origin === 'builtin'`, which the scanner sets from *which directory* the plugin was found in (`scanner.ts:13`) — not from anything the plugin can self-declare.
- **`activationEvents` is parsed but not yet event-driven.** Both parsers carry `activationEvents` into the manifest (`manifest.ts:107`, `vscode-manifest.ts:72`), but no host code matches them. Activation happens explicitly via the `plugins:activate` IPC, or lazily the first time a view is opened / a tree is queried / a webview message is delivered (each of `openView`, `treeGetChildren`, `deliverWebviewMessage`, `setActiveContext` calls `ensure()` + `$activate`). Don't assume `onCommand:` etc. lazy-activates a plugin.
- **The host process re-forks on crash; in-flight RPCs reject, they don't hang.** A plugin that crashes the utility process triggers `onHostDown`, which rejects every pending call and clears the `CommandRegistry` so the re-forked host starts clean (`extension-host.ts:52`, `command-registry.ts:36`). Awaiting callers fail loudly with `plugin host exited (code …)`.
- **Plugin ids are charset-validated *and* path-checked at write time.** Even though `parseManifest` restricts the id charset, `PluginStorageStore.fileFor()` re-verifies the resolved path stays inside `<storage>/plugin-storage/` before any read/write (`plugin-storage-store.ts:10`). Corrupt storage JSON is backed up to `.bak` (once) rather than silently overwritten (`plugin-storage-store.ts:43`).
- **Webview scripts must be nonced or they silently fail.** The CSP is `default-src 'none'; script-src 'nonce-…'`, so any `<script>` the injector misses is blocked and the panel renders blank with no console error; `injectNonce` emits a `debugLog` warning when `nonced < total` so the otherwise-invisible failure is traceable (`webview-protocol.ts:76`). `registerWebviewSchemePrivileged()` must run *before* `app.whenReady()` and `installWebviewProtocol()` *after* it.
- **Command id ownership is first-writer-wins on both sides.** The local handler map in the host (`api-impl.ts`) and the main-side `CommandRegistry` both refuse a cross-owner overwrite, so a second plugin can neither hijack nor unregister another plugin's command (`command-registry.ts:14`).
- **Disabling a plugin deactivates it.** `setEnabled(id, false)` runs the host's `$deactivate` (fire-and-forget), which disposes the plugin's `context.subscriptions` (commands + workspace/config/tree listeners) and `unregisterPluginApis(root)` for its `require('manifold')` frame (`plugin-host/index.ts:87`). As a window guard before that round-trips, `executeContributedCommand` rejects a command owned by a disabled plugin and `deliverWebviewMessage` drops messages to a disabled view's owner (`extension-host.ts`, `plugin-manager.ts`).
- **Main→host RPC calls time out; host→main calls don't.** The main-side endpoint rejects an outbound call (`$activate`/`$resolveView`/`$getChildren`/`$invokeCommand`/…) whose reply never arrives, so a plugin whose `activate()` returns a never-resolving promise can't hang the IPC caller forever (`extension-host.ts`, 5-min bound). The host→main endpoint has no timeout (`rpc.ts` default 0): agent turns, LM requests, and UI prompts there are intentionally long-lived.
