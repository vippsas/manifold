---
description: The plugin authoring API contract — the `manifold` runtime module, manifest fields, capabilities, and `contributes` that built-in plugins are written against.
covers: [src/shared/plugins]
updated: 2026-06-08
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

**Namespaces.** `manifold` is a `ManifoldApi` (`api-types.ts:80`) with these namespaces:

- `commands` — `registerCommand(id, handler)` and `executeCommand<T>(id, …args)` (`api-types.ts:81`). **Ungated.**
- `window` — `registerWebviewViewProvider(viewId, provider)`, `registerTreeDataProvider`, `createTreeView`, the three `show*Message(message, …actions)` dialogs, `showQuickPick`, `showInputBox` (`api-types.ts:86`). **Ungated.**
- `storage.global` — `get<T>(key, default?)` / `update(key, value)`, both `Promise`-returning (`api-types.ts:96`). Gated by `storage`.
- `workspace` — read-only `activeProject` / `activeSession` / `workspaceFolders` getters plus `onDidChangeActiveProject` / `onDidChangeActiveSession` (`api-types.ts:102`). Gated by `workspace:read`.
- `configuration` — `get<T>(key, default?)` and `onDidChange(listener)` (`api-types.ts:109`). Gated by `configuration`.
- `agents` — `activeAgent` getter and `getAgent(sessionId)` (`api-types.ts:113`). Gated by `agent:control`, **built-in only**.
- `lm` — `selectChatModels()` (`api-types.ts:117`). Gated by `lm`, **built-in only**.

**Capability gating.** `CAPABILITIES` (`manifest.ts:7`) is the single source of truth:
`['storage', 'workspace:read', 'configuration', 'agent:control', 'lm']`. The manifest
field, the parser, and the host's gating all key off it. `BUILTIN_ONLY_CAPABILITIES`
(`manifest.ts:14`) marks `agent:control` and `lm` as **privileged** — granted only to
plugins discovered with `origin: 'builtin'`. The host realizes this contract in
`buildGatedApi()` (`src/plugin-host/gated-api.ts:27`): `commands` and `window` pass
through ungated; the other five are lazy getters that throw `CapabilityError` if the
capability isn't declared, or `RestrictedCapabilityError` if it *is* declared but the
plugin's `origin !== 'builtin'`. So a privileged namespace fails on first **access**, not
at load time.

**Contributions.** `contributes` (`manifest.ts:48`) is declarative metadata read by the
host; runtime behavior still requires the matching API call:
- `commands: [{ command, title }]` (`manifest.ts:32`) — palette entries.
- `views: [{ id, title, description?, launcher?, type? }]` (`manifest.ts:19`), where `type` is `'webview'` (default) or `'tree'`. The plugin must back it with `registerWebviewViewProvider(id, …)` or `registerTreeDataProvider(id, …)` in `activate`.
- `configuration: { title?, properties }` (`manifest.ts:43`) — each property is `{ type: 'string'|'number'|'boolean', default?, description?, enum? }`, exposed to `configuration.get`.

Internal modules and plugin views are normalized to a single `PanelContribution`
(`contributions.ts:17`) for the "+ Apps" launcher, tagged with `source: 'internal' | 'plugin'`.

## Key types and entry points

- `ManifoldApi` — `api-types.ts:80`. The complete namespace surface; the host builds a gated instance per plugin.
- `ManifoldContext` — `api-types.ts:46`. `{ subscriptions: Disposable[]; pluginUri: string }`, passed to `activate`.
- `AgentSession` — `api-types.ts:18`. `{ readonly sessionId; runTurn(prompt, opts?, token?): Promise<TurnOutcome> }`. `runTurn` resolves `'ended' | 'timeout' | 'aborted'`; `opts` is `{ budgetSeconds?; clearContext? }`. Manifold-specific (VS Code has no agent-turn concept).
- `LanguageModelChat` — `api-types.ts:30`. `{ readonly id; sendRequest(prompt, opts?, token?): Promise<{ text: string }> }`; `opts` is `{ timeoutMs? }`. One-shot, non-streaming (Phase A).
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
- **RPC boundary** (`rpc.ts`): the plugin host runs in a separate process; every gated namespace call is an `RpcMessage` over `RpcEndpoint`, dispatched by the `HOST_*`/`PLUGIN_*` context id (`HOST_AGENTS`, `HOST_LM`, `HOST_STORAGE`, …). `rejectAllPending()` fails in-flight calls loudly if the host process dies.
- **Sessions / agents** (`src/main/session`, see `docs/architecture/session.md`): `agents.activeAgent` / `getAgent` resolve to a live `SessionManager` session; `runTurn` drives a real agent turn. `lm.selectChatModels()` and `sendRequest` run against the active session's runtime in its worktree.
- **Workspace** (see `docs/architecture/workspace.md`): `workspace.activeProject` / `activeSession` / `workspaceFolders` mirror the active project + session and its worktree path (`WorkspaceFolder.uri` is the worktree's absolute fs path).
- **Renderer UI**: webview/tree contributions surface in the dock + "+ Apps" launcher; `window.show*`/`showQuickPick`/`showInputBox` round-trip to the renderer's UI host as `UiRequest`s (`ui.ts:9`); tree items cross as `SerializedTreeItem` (`tree.ts:6`).
- **Build** (`scripts/build-plugins.mjs`, `npm run build:plugins`): esbuild compiles `src/plugin.ts` → `out/plugin.js` with `manifold` and `vscode` marked external (the host injects them). Details in `docs/plugins/authoring.md`.

## Invariants & gotchas

- **`commands` and `window` are never gated.** Only `storage`, `workspace`, `configuration`, `agents`, `lm` require a capability. Every plugin can register commands and show UI without declaring anything.
- **Privileged namespaces fail on first access, not at load.** `agent:control` and `lm` are lazy getters; a user-installed plugin that *declares* them still loads, then throws `RestrictedCapabilityError` the moment it touches `manifold.agents` / `manifold.lm` (`gated-api.ts:36`). `CAPABILITIES`/`BUILTIN_ONLY_CAPABILITIES` are the one enum; never hard-code capability strings elsewhere.
- **`export = api` is deliberate.** The ambient module (`manifold-module.d.ts:17`) uses CommonJS export so `const m = require('manifold')` is typed; named `import type` still resolves via the re-export block. Don't switch it to a default ESM export.
- **The live `ManifoldApi` is wider than `docs/plugins/authoring.md` documents.** Code today also exposes `window.registerTreeDataProvider`/`createTreeView`/`showInformationMessage`/`showWarningMessage`/`showErrorMessage`/`showQuickPick`/`showInputBox`, `agents.getAgent(sessionId)`, and a `'tree'` view `type` — none of which appear in the long-form guide. The guide also still types `runTurn`'s outcome inline rather than as the exported `TurnOutcome` alias (`api-types.ts:14`). When they disagree, `api-types.ts` wins.
- **`contributes` is metadata, not behavior.** Declaring a view/command/config key registers it in the UI/palette and config store, but the plugin must still call the matching `register*`/handler in `activate` for it to do anything.
- **`storage.global` and `configuration.get` are async.** Both return `Promise`s; `update`/`get` always await. There is no synchronous accessor.
