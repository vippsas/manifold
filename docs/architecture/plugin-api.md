---
description: The plugin authoring API contract — the `manifold` runtime module, manifest fields, capabilities, and `contributes` that built-in plugins are written against.
covers: [src/shared/plugins]
updated: 2026-06-19
owner: see .github/CODEOWNERS
---

# Plugin API — the `manifold` runtime contract

A *plugin* extends Manifold through the `manifold` module — an object the plugin host
injects at runtime via a `require('manifold')` interceptor. This subsystem is the
**type contract** both sides agree on: the ambient module declaration a plugin imports,
the `ManifoldApi` interface its namespaces conform to, the manifest (`package.json`)
shape, the `capabilities` enum that gates the privileged namespaces, and the `contributes`
descriptors for views/commands/configuration. Everything here is pure types and small
pure helpers — no host wiring. The process that *loads, gates, and serves* these calls is
a separate page, `docs/architecture/plugins.md`; the long-form walkthrough is
`docs/plugins/authoring.md`. This page is the concise, code-bound reference.

## Covered code

- `src/shared/plugins/api-types.ts` — `ManifoldApi` (the full namespace surface) plus every interface a plugin imports: `ManifoldContext`, `Disposable`, `AgentSession`, `LanguageModelChat`, `WorkspaceFolder`, `WebviewViewProvider`, `TreeDataProvider`, `ProjectInfo`/`SessionInfo`, `CancellationToken`, `PluginModule`.
- `src/shared/plugins/manifold-module.d.ts` — the ambient `declare module 'manifold'`. Uses `export = api` (CommonJS) so `require('manifold')` is typed as `ManifoldApi`, while re-exporting the named types so `import type { ManifoldContext } from 'manifold'` also resolves.
- `src/shared/plugins/manifest.ts` — `ManifoldPluginManifest` (the `package.json` shape), `PluginDescriptor`, the `CAPABILITIES` / `BUILTIN_ONLY_CAPABILITIES` enums + guards, and the `contributes` sub-shapes (`PluginViewContribution`, `PluginCommandContribution`, `PluginConfiguration`).
- `src/shared/plugins/contributions.ts` — `PanelContribution` / `ContributionSource`: the normalized panel shape internal modules and plugins both map onto for the "+ Apps" launcher.
- `src/shared/plugins/ui.ts` — `QuickPickItem`/`QuickPickOptions`/`InputBoxOptions`, the `UiRequest` wire union, and `normalizeQuickPickItems()`.
- `src/shared/plugins/tree.ts` — `SerializedTreeItem` and `collapsibleStateToWire()` for native tree views.
- `src/shared/plugins/rpc.ts` — `RpcEndpoint` / `RpcMessage` and the `HOST_*` / `PLUGIN_*` context ids; the structured-clone request/reply layer every namespace is proxied over.

Not detailed here: the host that consumes these types (`src/main/plugins/*`, `src/plugin-host/*`). The capability *enforcement* lives there (`src/plugin-host/gated-api.ts`) — see `docs/architecture/plugins.md`.

## How it works

**Entry shape.** A plugin's module exports `activate(context)` and optionally
`deactivate()` (`PluginModule`, `api-types.ts:123`). `activate` receives a
`ManifoldContext` (`api-types.ts:46`) with a `subscriptions: Disposable[]` array (push
your `Disposable`s; the host disposes them on deactivate) and `pluginUri`, the absolute
plugin folder path.

**Namespaces.** `manifold` is a `ManifoldApi` (`api-types.ts:111`) with these namespaces:

- `commands` — `registerCommand(id, handler)` and `executeCommand<T>(id, …args)` (`api-types.ts:112`). **Ungated.**
- `window` — `registerWebviewViewProvider(viewId, provider)`, `registerTreeDataProvider`, `createTreeView`, the three `show*Message(message, …actions)` dialogs, `showQuickPick`, `showInputBox`, and `openExternal(url)` — the last opens an http(s) URL in the browser via `HOST_UI.$openExternal` → `shell.openExternal`, with non-http(s) schemes rejected by `isExternallyOpenable` (`extension-host.ts`); used by the statistics webview to reach a PR since the sandboxed iframe can't navigate out (`api-types.ts:117`). **Ungated.**
- `storage.global` — `get<T>(key, default?)` / `update(key, value)`, both `Promise`-returning (`api-types.ts:127`). Gated by `storage`.
- `workspace` — read-only `activeProject` / `activeSession` / `workspaceFolders` getters plus `onDidChangeActiveProject` / `onDidChangeActiveSession` (`api-types.ts:133`). Gated by `workspace:read`.
- `configuration` — `get<T>(key, default?)` and `onDidChange(listener)` (`api-types.ts:140`). Gated by `configuration`.
- `agents` — `activeAgent` getter, `getAgent(sessionId)`, and `spawnSibling(baseSessionId, opts?)` (`api-types.ts:144`). The namespace admits **either** `agent:control` or `agent:spawn` (both built-in only); each `AgentSession` method then re-checks its own capability — `runTurn` needs `agent:control`, `sendText`/`whenReady`/`getStatus`/`kill`/`reveal` and `spawnSibling` need `agent:spawn` (`agents-api.ts:30`).
- `lm` — `selectChatModels(sessionId?)` (`api-types.ts:151`). Gated by `lm`, **built-in only**. An explicit `sessionId` pins the model to that session's runtime; omit it for the active session.
- `transcription` — `get()` returning the app-level `AiServiceSettings` (transcription/chat keys from core settings) or `undefined` when unconfigured (`api-types.ts:157`). Gated by `transcription:read`, **built-in only**.
- `verdicts` — `listByProject(projectId, limit?)` returning recorded session `VerdictRecord[]` for one project, oldest→newest, and `clearProject(projectId)` deleting them (`api-types.ts:210`). The namespace is admitted by `verdicts:read`; the destructive `clearProject` re-checks `verdicts:write` (like the agents methods, `gated-api.ts`). Both **built-in only** — the read/reset path the `manifold.statistics` dashboard plugin uses instead of renderer IPC.

**Capability gating.** `CAPABILITIES` (`manifest.ts:7`) is the single source of truth:
`['storage', 'workspace:read', 'workspace:manage', 'configuration', 'agent:control', 'agent:spawn', 'lm', 'transcription:read', 'verdicts:read', 'verdicts:write']`.
The manifest field, the parser, and the host's gating all key off it.
`BUILTIN_ONLY_CAPABILITIES` (`manifest.ts:14`) marks `workspace:manage`, `agent:control`, `agent:spawn`, `lm`,
`transcription:read`, `verdicts:read`, and `verdicts:write` as **privileged** — granted only to plugins discovered with
`origin: 'builtin'`. The host realizes this contract in `buildGatedApi()`
(`src/plugin-host/gated-api.ts:28`): `commands` and `window` pass through ungated; the
gated namespaces are lazy getters that throw `CapabilityError` if the capability isn't
declared, or `RestrictedCapabilityError` if it *is* declared but the plugin's
`origin !== 'builtin'`. The `agents` getter is the one shared gate: either `agent:control`
or `agent:spawn` admits it, and the factory receives the declared capability set for the
per-method re-checks (`gated-api.ts:48`). So a privileged namespace fails on first
**access**, not at load time.

**Contributions.** `contributes` (`manifest.ts:48`) is declarative metadata read by the
host; runtime behavior still requires the matching API call:
- `commands: [{ command, title }]` (`manifest.ts:35`) — palette entries.
- `views: [{ id, title, description?, launcher?, type?, frameSources? }]` (`manifest.ts:19`), where `type` is `'webview'` (default) or `'tree'`. `frameSources` (`manifest.ts:32`) is a list of **exact https origins** the view's webview may embed in iframes — it widens that view's CSP `frame-src` only (validated strictly in `src/main/plugins/manifest.ts:22`; served per-view by `webview-protocol.ts:102`). The plugin must back the view with `registerWebviewViewProvider(id, …)` or `registerTreeDataProvider(id, …)` in `activate`.
- `configuration: { title?, properties }` (`manifest.ts:46`) — each property is `{ type: 'string'|'number'|'boolean', default?, description?, enum? }`, exposed to `configuration.get`.

Internal modules and plugin views are normalized to a single `PanelContribution`
(`contributions.ts:17`) for the "+ Apps" launcher, tagged with `source: 'internal' | 'plugin'`.

## Key types and entry points

- `ManifoldApi` — `api-types.ts:111`. The complete namespace surface; the host builds a gated instance per plugin.
- `ManifoldContext` — `api-types.ts:77`. `{ subscriptions: Disposable[]; pluginUri: string }`, passed to `activate`.
- `AgentSession` — `api-types.ts:22`. `{ readonly sessionId; runTurn(…); sendText(text); whenReady(timeoutMs?); getStatus(); kill(); reveal(title?) }`. `runTurn` (gated `agent:control`) resolves `'ended' | 'timeout' | 'aborted'`; the raw-PTY methods (gated `agent:spawn`) pass keystrokes through verbatim (`sendText` — the caller owns typing rhythm), poll for the TUI prompt (`whenReady`), report `SpawnedSessionStatus` (`api-types.ts:17`, `'running'|'waiting'|'done'|'error'|'missing'`), kill the session, or ask the app to open its dock panel (`reveal` → `plugins:reveal-session` push). Manifold-specific (VS Code has no agent-turn concept).
- `LanguageModelChat` — `api-types.ts:46`. `{ readonly id; sendRequest(prompt, opts?, token?): Promise<{ text: string }> }`; `opts` is `{ timeoutMs? }`. One-shot, non-streaming (Phase A).
- `AiServiceSettings` — `api-types.ts:60`. App-level AI-service settings (provider + OpenAI/Azure keys), shared with core consumers; returned by `manifold.transcription.get()`.
- `ManifoldPluginManifest` — `manifest.ts:54`. The `package.json` contract: `name`, `publisher`, `version`, `engines.manifold` (or `vscode`), `main`, plus optional `displayName`, `description`, `activationEvents`, `contributes`, `capabilities`.
- `PluginDescriptor` — `manifest.ts:70`. A discovered plugin: `{ id: '${publisher}.${name}', manifest, root, origin: 'builtin'|'user', kind: 'manifold'|'vscode' }`. `origin` is what drives privileged-capability gating.
- `CAPABILITIES` / `isCapability` / `BUILTIN_ONLY_CAPABILITIES` / `isBuiltinOnlyCapability` — `manifest.ts:7`–`17`.
- `RpcEndpoint` — `rpc.ts:32`. `registerService(ctx, impl)` + `getProxy<T>(ctx)`; the `HOST_*`/`PLUGIN_*` context ids (`rpc.ts:15`) name each service across the boundary.

The reference plugin is `resources/plugins/hello/` — `package.json` declares
`storage`, `workspace:read`, `configuration` and contributes a panel + two commands;
`src/plugin.ts` exercises `commands`, `window` (webview + `showInputBox`/`showQuickPick`/
`showInformationMessage`), `storage.global`, `configuration`, and
`workspace.onDidChangeActiveProject`.

## Interactions

- **Host / loader** (`src/main/plugins`, `src/plugin-host`): discovers plugins into `PluginDescriptor`s, builds the gated `ManifoldApi` per plugin (`gated-api.ts`), and serves each namespace's calls. The full lifecycle is `docs/architecture/plugins.md`.
- **RPC boundary** (`rpc.ts`): the plugin host runs in a separate process; every gated namespace call is an `RpcMessage` over `RpcEndpoint`, dispatched by the `HOST_*`/`PLUGIN_*` context id (`HOST_AGENTS`, `HOST_LM`, `HOST_STORAGE`, …). `rejectAllPending()` fails in-flight calls loudly if the host process dies. An optional per-endpoint `callTimeoutMs` (off by default, `0`) rejects an outbound call whose reply never arrives — the main→host endpoint opts in so a never-resolving `activate()` can't hang the caller, while the host→main endpoint stays untimed for intentionally long calls (agent turns, LM, UI prompts).
- **Sessions / agents** (`src/main/session`, see `docs/architecture/session.md`): `agents.activeAgent` / `getAgent` resolve to a live `SessionManager` session; `runTurn` drives a real agent turn. `lm.selectChatModels(sessionId?)` and `sendRequest` run against the given session's runtime in its worktree — or the active session's when `sessionId` is omitted (`lm-api.ts:14`). The loop judge passes its pinned session so switching the active agent mid-run doesn't redirect the request.
- **Workspace** (see `docs/architecture/workspace.md`): `workspace.activeProject` / `activeSession` / `workspaceFolders` mirror the active project + session and its worktree path (`WorkspaceFolder.uri` is the worktree's absolute fs path).
- **Renderer UI**: webview/tree contributions surface in the dock + "+ Apps" launcher; `window.show*`/`showQuickPick`/`showInputBox` round-trip to the renderer's UI host as `UiRequest`s (`ui.ts:9`); tree items cross as `SerializedTreeItem` (`tree.ts:6`).
- **Build** (`scripts/build-plugins.mjs`, `npm run build:plugins`): esbuild compiles `src/plugin.ts` → `out/plugin.js` with `manifold` and `vscode` marked external (the host injects them). Details in `docs/plugins/authoring.md`.

## Invariants & gotchas

- **`commands` and `window` are never gated.** Only `storage`, `workspace`, `configuration`, `agents`, `lm`, `transcription` require a capability. Every plugin can register commands and show UI without declaring anything.
- **Privileged namespaces fail on first access, not at load.** `workspace:manage`, `agent:control`, `agent:spawn`, `lm`, `transcription:read`, and `verdicts:read` are lazy getters; a user-installed plugin that *declares* them still loads, then throws `RestrictedCapabilityError` the moment it touches `manifold.worktrees` / `manifold.agents` / `manifold.lm` / `manifold.transcription` / `manifold.verdicts` (`gated-api.ts:37`). `CAPABILITIES`/`BUILTIN_ONLY_CAPABILITIES` are the one enum; never hard-code capability strings elsewhere.
- **The `agents` namespace is capability-split.** Holding only `agent:spawn` admits `manifold.agents` but `runTurn` still throws `CapabilityError`; holding only `agent:control` admits it but `spawnSibling`/`sendText`/… throw. The per-method checks live in `agents-api.ts:30`, not in the gate.
- **`export = api` is deliberate.** The ambient module (`manifold-module.d.ts:17`) uses CommonJS export so `const m = require('manifold')` is typed; named `import type` still resolves via the re-export block. Don't switch it to a default ESM export.
- **The live `ManifoldApi` is wider than `docs/plugins/authoring.md` documents.** Code today also exposes `window.registerTreeDataProvider`/`createTreeView`/`showInformationMessage`/`showWarningMessage`/`showErrorMessage`/`showQuickPick`/`showInputBox`, `agents.getAgent(sessionId)`, and a `'tree'` view `type` — none of which appear in the long-form guide. The guide also still types `runTurn`'s outcome inline rather than as the exported `TurnOutcome` alias (`api-types.ts:14`). When they disagree, `api-types.ts` wins.
- **`contributes` is metadata, not behavior.** Declaring a view/command/config key registers it in the UI/palette and config store, but the plugin must still call the matching `register*`/handler in `activate` for it to do anything.
- **`storage.global` and `configuration.get` are async.** Both return `Promise`s; `update`/`get` always await. There is no synchronous accessor.
