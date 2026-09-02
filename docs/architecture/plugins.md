---
description: How Manifold's main process discovers, loads, gates, and tears down plugins — the host side that forks the extension-host utility process and enforces capabilities.
covers: [src/main/plugins, src/plugin-host]
updated: 2026-09-02
owner: see .github/CODEOWNERS
---

# Plugins (host) — discovery, loading, capability gating

The plugin *host* is the main-process machinery that finds plugins on disk, forks a
sandboxed extension-host utility process to run their code, and brokers every call
between that process and the rest of the app. It is also the trust boundary: plugins
declare *capabilities* in their manifest, and the host decides which API namespaces a
plugin may touch — including the privileged capabilities (`workspace:manage`, `agent:control`,
`agent:spawn`, `lm`, `transcription:read`, `verdicts:read`, `verdicts:write`) that are restricted to built-in
plugins no matter what their manifest claims.

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
- `src/main/plugins/agent-spawn-service.ts` — the privileged main-side service behind `agent:spawn`: spawn a same-runtime sibling beside a base session, plus raw PTY input (`sendText`), TUI-ready polling (`whenReady`), status/kill. Its native-only `spawnAgent` path lets core orchestrators choose another runtime and a fresh managed worktree without widening the plugin API.
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
origin, …)` (`plugin-host/index.ts:72`, `gated-api.ts:28`). `commands` and `window` are
always available; `storage`, `workspace`, `configuration`, `agents`, `lm`, and
`transcription` are lazy getters that call `requireCap()` on first access. `requireCap`
throws `CapabilityError` when the capability isn't declared, and
`RestrictedCapabilityError` when a built-in-only capability is requested by a
non-built-in plugin (`gated-api.ts:35`). The built-in-only set is
`BUILTIN_ONLY_CAPABILITIES = ['workspace:manage', 'agent:control', 'agent:spawn', 'lm', 'transcription:read', 'verdicts:read', 'verdicts:write']`
(`shared/plugins/manifest.ts:14`), so even a user plugin that declares one in its manifest
is denied at the getter because its `origin !== 'builtin'`. The `agents` namespace is the
one shared gate: either `agent:control` or `agent:spawn` admits it, and the factory
receives the declared capability set so each method re-checks its own capability
(`gated-api.ts:48`, `plugin-host/agents-api.ts:30`). These namespaces are backed in the
main process by `AgentControlService` (drives a session's agent for one turn,
`agent-control-service.ts:110`), `AgentSpawnService` (sibling-session spawn + raw PTY
input, `agent-spawn-service.ts:39`), `LmService` (one-shot generation via the active
session's runtime, `lm-service.ts:19`), and the transcription-settings resolver
(`extension-host.ts:70`, set by `PluginManager` from the core settings store) — exactly
the powers that warrant the restriction. The verdicts namespace is read/write split:
`verdicts:read` admits `listByProject`/`listAll`, while `clearProject` and
`verifyPullRequests` re-check `verdicts:write` in the host-side gated API
(`gated-api.ts:61`, `:68`) and again at the trusted main RPC handler
(`extension-host.ts:203`, `:207`).

The `gated-api.ts` getter check runs *inside* the host process, alongside untrusted
plugin code, so it is a convenience gate, not the trust boundary. The authoritative check
is on the main side: the host-side `agents`/`lm`/`transcription`/`worktrees`/`verdicts` proxies thread the
calling plugin's `pluginId` into every `HOST_AGENTS`/`HOST_LM`/`HOST_TRANSCRIPTION`/`HOST_WORKTREES`/`HOST_VERDICTS` RPC
(`agents-api.ts`, `lm-api.ts`, `transcription-api.ts`, `worktrees-api.ts`, `verdicts-api.ts`), and the main handlers call
`assertBuiltin(pluginId, …)` — resolving the plugin's `origin` via `PluginManager` and
rejecting any non-builtin (or unknown) caller before the privileged service runs
(`extension-host.ts:170-197`). A plugin that reaches the RPC endpoint directly, bypassing
`buildGatedApi`, is still refused. `AgentSession.reveal()` is the one main-side push in
the set: it forwards `plugins:reveal-session` to the renderer, which opens the session's
dock panel via `openSiblingPanel` (`extension-host.ts:178`,
`src/renderer/hooks/app/useAppEffects.ts:86`).

**Commands.** Command ids are owned end-to-end. A plugin's `commands.registerCommand`
threads its `pluginId` to the host's `$registerCommand`, which calls
`CommandRegistry.register(id, owner, …)` (`host-commands-service.ts:24`). The registry is
first-writer-wins: a second plugin registering an existing id is logged and ignored, and
only the owner may unregister (`command-registry.ts:14`). Execution routes back to the
owning plugin's process via the `PLUGIN_COMMANDS` proxy.

**Views & webviews.** `listViewContributions()` flattens every *enabled* plugin's
`contributes.views` into renderer `PanelContribution`s (`plugin-manager.ts:106`,
`:20`). Opening a webview view calls `openView()` → `ExtensionHost.resolveView()`, which
activates the plugin then asks it to `$resolveView` (`extension-host.ts:106`). Each
resolve corresponds to a fresh webview document (panels remount on agent switches), so
the plugin-host side replaces the view's `onDidReceiveMessage` listener set per resolve
(`plugin-host/window-api.ts:66`) — stale handlers from prior resolutions would otherwise
handle every message once per remount. The plugin
sets HTML via the host's `$setHtml`, which writes the `webviewContentStore` and pushes a
`plugins:webview-html` event with a new version (`extension-host.ts:67`). The renderer
loads `manifold-webview://view/<id>?v=<n>`; `installWebviewProtocol()` serves it from the
store, injecting a **fresh per-request nonce CSP** and adding that nonce to every
`<script>` tag (`webview-protocol.ts:157`, `:37`). A view whose manifest declares
`frameSources` (exact https origins, validated in `manifest.ts:22`) gets a `frame-src`
clause appended to its CSP only: `scan()` registers each view's sources into the
content store (`plugin-manager.ts:120`, `webview-content-store.ts:18`) and `buildCsp`
widens the policy per request (`webview-protocol.ts:102`); every other view keeps the
no-frames default. Two more pieces make those embeds actually play: the renderer hosts
webviews in an iframe sandboxed `allow-scripts allow-same-origin`
(`PluginViewPanel.tsx:81`) — sandbox flags propagate to nested browsing contexts, so
without `allow-same-origin` a frameSources embed runs from an opaque origin and
black-screens (script isolation rests on the nonce CSP, not the sandbox) — and
`installFrameSourceReferrer()` patches a loopback `Referer` onto sub-frame requests to
declared frameSources origins (`webview-protocol.ts:194`, decision logic
`frameReferrerPatch` `webview-protocol.ts:171`), because Chromium drops referrers from
`manifold-webview://` documents and YouTube rejects refererless embeds ("Error 153").
Tree views skip HTML entirely and pull
nodes through `treeGetChildren()` (`plugin-manager.ts:136`). Interactive prompts
(`window.showMessage` etc.) go through `UiRequestBroker`, which emits `plugins:ui-request`
and resolves when the renderer replies via `plugins:ui-response` (`ui-broker.ts:10`).

**Lifecycle / disposal.** The host process is forked lazily and recovers on death: an
`exit` or `error` event rejects every in-flight RPC, **flushes pending renderer UI prompts**
(so a `$showMessage`/`$showQuickPick`/`$showInputBox` awaiting a reply settles instead of
leaking its promise), and clears the `CommandRegistry`, then nulls `child`/`endpoint` so the
next call re-forks a clean host (`onHostDown`, `extension-host.ts`). To stop a plugin that
crashes during `activate()` from re-forking and re-crashing in a tight loop, a
**crash circuit-breaker** counts crashes (non-zero `exit` / `error`) within a window
(`CRASH_THRESHOLD` in `CRASH_WINDOW_MS`); once tripped, `ensure()` refuses to re-fork until
an exponential backoff elapses, and the window resets when the host stays up. In the child,
an uncaught exception is logged and exits the process (so main can re-fork), while an
unhandled rejection is only logged (`plugin-host/index.ts:26`). `ExtensionHost.dispose()`
flushes pending UI, rejects pending RPCs, clears commands, and kills the child
(`extension-host.ts`); `PluginManager.dispose()` calls it, and the app `before-quit` handler
invokes `pluginManager.dispose()` so the forked utility process doesn't orphan on quit
(`app-lifecycle.ts`). The `Activator.deactivate()` path runs the plugin's `deactivate()` and
disposes its `context.subscriptions` (`activator.ts:27`), and the host's `$deactivate` then
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
- **Session** (`src/main/session`): `AgentControlService` and `LmService` read live sessions via `SessionManager.getSession`/`getInternalSession`/`sendInput`; `setActiveContext` enriches the renderer's context with the session's `worktreePath` and `runtimeId` (`plugin-manager.ts:181`) — the latter lets a plugin pick a runtime-specific agent invocation (e.g. watch's `/watch:watch` vs Codex's `$watch`).
- **Orchestrated siblings:** native Viola calls `spawnAgent(baseId, { runtimeId, newWorktree, nonInteractive: true })`, which creates a chat-mode child on the requested runtime, in a managed worktree forked from the base session's committed `HEAD` when `newWorktree` is set, marks it `orchestratedBy: baseId` so its Claude turns run guarded, and returns its runtime/worktree metadata (`agent-spawn-service.ts:57`, `:92`). Plugin-facing `spawnSibling` keeps its existing base-runtime/base-checkout behavior, preserving Watch's contract.
- **Git** (`src/main/git`): `LmService.sendRequest` calls `GitOperationsManager.aiGenerate` to do one-shot generation through the runtime (`lm-service.ts:37`); the verdict service injected by `PluginManager` uses `viewPullRequestStatus` when built-in plugins request PR verification (`plugin-manager.ts:110`).
- **Settings store** (`src/main/store`): enable/disable lives in `settings.disabledPlugins`; per-plugin config overrides live in `settings.pluginConfig` and merge over manifest defaults (`plugin-manager.ts:59`, `:69`). Ids listed in `SETTINGS_HIDDEN_PLUGINS` (`src/shared/defaults.ts:22`) are filtered out of the Settings → Plugins list (`PluginSettingsSection.tsx:48`), so a default-disabled plugin such as `manifold.statistics` ships with no toggle at all.
- **IPC** (`src/main/ipc/plugin-handlers.ts`): `plugins:list`, `plugins:list-contributions`, `plugins:set-enabled`, `plugins:activate`, `plugins:execute-command`, `plugins:open-view`/`open-tree-view`, `plugins:tree-get-children`, `plugins:webview-to-host`, `plugins:set-active-context`, `plugins:get-config`/`set-config`, `plugins:ui-response`. The manager pushes `plugins:webview-html`, `plugins:webview-message`, `plugins:tree-refresh`, `plugins:ui-request`, and `plugins:contributions-changed` to the renderer through `setMainWindow`'s `send` (`plugin-manager.ts:120`).
- **Renderer** (`src/renderer/plugins`, `components/editor/plugins`): `PluginViewPanel` triggers `plugins:open-view` and listens for `plugins:webview-html`; `usePluginTree` drives tree views; `use-contributions` reloads the launcher on `plugins:contributions-changed`.

## Invariants & gotchas

- **`workspace:manage`, `agent:control`, `agent:spawn`, `lm`, `transcription:read`, `verdicts:read`, and `verdicts:write` are built-in-only — re-enforced on the trusted main side, not just at the host getter.** Declaring them in a user plugin's manifest passes parse-time validation (they are valid capabilities) but throws `RestrictedCapabilityError` the moment the plugin touches `manifold.worktrees` / `manifold.agents` / `manifold.lm` / `manifold.transcription` / `manifold.verdicts` (`gated-api.ts:37`). That getter check runs inside the host process, so it is not authoritative: every `HOST_WORKTREES`/`HOST_AGENTS`/`HOST_LM`/`HOST_TRANSCRIPTION`/`HOST_VERDICTS` RPC also carries the calling `pluginId`, and the main handlers call `assertBuiltin()` to reject any non-builtin/unknown caller before driving an agent, spawning a session, reading API keys, the LLM, managed worktrees, or recorded/mutated verdicts (`extension-host.ts:170-207`) — so a plugin can't escape the gate by hitting the RPC endpoint directly. The restriction keys on `origin === 'builtin'`, which the scanner sets from *which directory* the plugin was found in (`scanner.ts:13`) — not from anything the plugin can self-declare.
- **`activationEvents` is parsed but not yet event-driven.** Both parsers carry `activationEvents` into the manifest (`manifest.ts:107`, `vscode-manifest.ts:72`), but no host code matches them. Activation happens explicitly via the `plugins:activate` IPC, or lazily the first time a view is opened / a tree is queried / a webview message is delivered (each of `openView`, `treeGetChildren`, `deliverWebviewMessage`, `setActiveContext` calls `ensure()` + `$activate`). Don't assume `onCommand:` etc. lazy-activates a plugin.
- **The host process re-forks on crash (with backoff); in-flight RPCs reject, they don't hang.** A plugin that crashes the utility process triggers `onHostDown`, which rejects every pending call, flushes pending UI prompts, and clears the `CommandRegistry` so the re-forked host starts clean (`extension-host.ts`, `command-registry.ts:36`). Awaiting callers fail loudly with `plugin host exited (code …)`. A crash circuit-breaker counts crashes within a window and, once tripped, makes `ensure()` refuse to re-fork until an exponential backoff elapses — so a host that crashes on `activate()` backs off instead of re-forking on every `setActiveContext`/`openView`/… call.
- **Plugin ids are charset-validated *and* path-checked at write time.** Even though `parseManifest` restricts the id charset, `PluginStorageStore.fileFor()` re-verifies the resolved path stays inside `<storage>/plugin-storage/` before any read/write (`plugin-storage-store.ts:10`). Corrupt storage JSON is backed up to `.bak` (once) rather than silently overwritten (`plugin-storage-store.ts:43`).
- **Webview scripts must be nonced or they silently fail.** The CSP is `default-src 'none'; script-src 'nonce-…'`, so any `<script>` the injector misses is blocked and the panel renders blank with no console error; `injectNonce` emits a `debugLog` warning when `nonced < total` so the otherwise-invisible failure is traceable (`webview-protocol.ts:76`). `registerWebviewSchemePrivileged()` must run *before* `app.whenReady()` and `installWebviewProtocol()` *after* it.
- **Command id ownership is first-writer-wins on both sides.** The local handler map in the host (`api-impl.ts`) and the main-side `CommandRegistry` both refuse a cross-owner overwrite, so a second plugin can neither hijack nor unregister another plugin's command (`command-registry.ts:14`).
- **Disabling a plugin deactivates it.** `setEnabled(id, false)` runs the host's `$deactivate` (fire-and-forget), which disposes the plugin's `context.subscriptions` (commands + workspace/config/tree listeners) and `unregisterPluginApis(root)` for its `require('manifold')` frame (`plugin-host/index.ts:87`). As a window guard before that round-trips, `executeContributedCommand` rejects a command owned by a disabled plugin and `deliverWebviewMessage` drops messages to a disabled view's owner (`extension-host.ts`, `plugin-manager.ts`).
- **Main→host RPC calls time out; host→main calls don't.** The main-side endpoint rejects an outbound call (`$activate`/`$resolveView`/`$getChildren`/`$invokeCommand`/…) whose reply never arrives, so a plugin whose `activate()` returns a never-resolving promise can't hang the IPC caller forever (`extension-host.ts`, 5-min bound). The host→main endpoint has no timeout (`rpc.ts` default 0): agent turns, LM requests, and UI prompts there are intentionally long-lived.
