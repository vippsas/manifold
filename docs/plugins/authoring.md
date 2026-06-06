# Authoring Built-in Manifold Plugins

Built-in plugins are TypeScript modules that ship inside the Manifold app bundle
and extend it through the `manifold` runtime API. The reference implementation is
`resources/plugins/hello/`.

---

## Directory layout

```
resources/plugins/<publisher>.<name>/
  package.json          # plugin manifest
  src/
    plugin.ts           # entry point (filename must match manifest `main`)
  out/
    plugin.js           # compiled output — gitignored, produced by build
```

`<publisher>` and `<name>` must each match `/^[a-z0-9][a-z0-9-]*$/`
(lowercase alphanumeric with hyphens, starting with an alphanumeric character).
Together they form the plugin id `publisher.name`, used in command namespaces,
storage paths, and view identifiers.

---

## Manifest (`package.json`)

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Plugin name segment, e.g. `hello` |
| `publisher` | yes | Publisher segment, e.g. `manifold` |
| `version` | yes | SemVer string |
| `displayName` | no | Human-readable name shown in UI |
| `engines.manifold` | yes | Compatible Manifold version range, e.g. `^0.3.0` |
| `main` | yes | Relative path to compiled entry, e.g. `./out/plugin.js` |
| `activationEvents` | no | When to activate. `onStartupFinished` or `onCommand:<id>` |
| `capabilities` | no | Array of capability strings (see below) |
| `contributes` | no | Views, commands, configuration contributions (see below) |

### Capabilities

Capabilities gate which API namespaces are available to the plugin at runtime.
Declare only what you need:

| Capability | Unlocks |
|------------|---------|
| `storage` | `manifold.storage.global` — persistent key/value store |
| `workspace:read` | `manifold.workspace.activeProject`, `activeSession`, `workspaceFolders`, `onDidChangeActiveProject`, `onDidChangeActiveSession` |
| `configuration` | `manifold.configuration.get`, `manifold.configuration.onDidChange` |
| `agent:control` | `manifold.agents.activeAgent` — drive the active session's agent. **Built-in plugins only.** |
| `lm` | `manifold.lm` — one-shot language-model requests via the active session runtime. **Built-in plugins only.** |

The `agent:control` and `lm` capabilities are **privileged**: even when declared, they
are granted only to built-in plugins (those discovered with `origin: 'builtin'`). A
user-installed plugin that declares them fails at first use with a restriction error.

### `contributes`

- **`commands`** — `[{ command: "publisher.name.foo", title: "Label" }]`
  Registers commands in the command palette.

- **`views`** — `[{ id: "publisher.name.panel", title: "My Panel", description: "...", launcher: true }]`
  Registers a webview panel. The plugin must call
  `manifold.window.registerWebviewViewProvider(id, provider)` in `activate`.

- **`configuration`** — `{ title: "...", properties: { key: { type, default, description } } }`
  Declares typed configuration keys readable via `manifold.configuration.get`.

---

## The `manifold` API

The API is injected at runtime by the plugin host's require interceptor. Import it
as a CommonJS require and annotate the type via ambient types in
`src/shared/plugins/manifold-module.d.ts`:

```typescript
import type { ManifoldContext } from 'manifold'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifold = require('manifold') as typeof import('manifold')
```

### `manifold.commands`

```typescript
manifold.commands.registerCommand(id: string, handler: (...args: any[]) => unknown): Disposable
manifold.commands.executeCommand<T>(id: string, ...args: unknown[]): Promise<T>
```

### `manifold.window`

```typescript
manifold.window.registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable
```

The `WebviewView` passed to `resolveWebviewView` exposes `webview.html`,
`webview.postMessage(msg)`, and `webview.onDidReceiveMessage(listener)`.

### `manifold.storage`

```typescript
manifold.storage.global.get<T>(key: string, defaultValue?: T): Promise<T | undefined>
manifold.storage.global.update(key: string, value: unknown): Promise<void>
```

Requires the `storage` capability.

### `manifold.workspace`

```typescript
manifold.workspace.activeProject: ProjectInfo | undefined   // { id, name, path }
manifold.workspace.activeSession: SessionInfo | undefined   // { id, status, branchName?, worktreePath? }
manifold.workspace.workspaceFolders: readonly WorkspaceFolder[] | undefined  // active session's worktree; { name, uri } where uri is the worktree fs path
manifold.workspace.onDidChangeActiveProject(listener): Disposable
manifold.workspace.onDidChangeActiveSession(listener): Disposable
```

Requires the `workspace:read` capability.

### `manifold.agents` *(capability `agent:control`, built-in plugins only)*

```typescript
manifold.agents.activeAgent: AgentSession | undefined
interface AgentSession {
  readonly sessionId: string
  runTurn(prompt: string, opts?: { budgetSeconds?: number; clearContext?: boolean }, token?: CancellationToken): Promise<'ended' | 'timeout' | 'aborted'>
}
```

`runTurn` sends `prompt` to the live agent (optionally `/clear`-ing context first) and
resolves when the agent's turn ends, the budget elapses (`budgetSeconds`, default 300), or
the `CancellationToken` fires. `activeAgent` is `undefined` when no session is active.

### `manifold.lm` *(capability `lm`, built-in plugins only)*

```typescript
manifold.lm.selectChatModels(): Promise<LanguageModelChat[]>
interface LanguageModelChat {
  readonly id: string
  sendRequest(prompt: string, opts?: { timeoutMs?: number }, token?: CancellationToken): Promise<{ text: string }>
}
```

Modeled on VS Code's Language Model API. Phase A is one-shot (non-streaming):
`selectChatModels()` returns the active session's runtime model, or `[]` when no session is
active; `sendRequest` runs a single generation in the active session's worktree.

### `manifold.configuration`

```typescript
manifold.configuration.get<T>(key: string, defaultValue?: T): Promise<T | undefined>
manifold.configuration.onDidChange(listener: () => void): Disposable
```

Requires the `configuration` capability.

### `ManifoldContext`

```typescript
interface ManifoldContext {
  subscriptions: Disposable[]   // push Disposables here; host disposes on deactivate
  pluginUri: string             // absolute path to the plugin's folder
}
```

### Entry point shape

```typescript
export function activate(context: ManifoldContext): void | Promise<void> { ... }
export function deactivate(): void | Promise<void> { ... }
```

---

## Build and run

```bash
npm run build:plugins      # compile all plugins in resources/plugins/
```

The build script (`scripts/build-plugins.mjs`) uses esbuild with
`manifold` and `vscode` marked external. It derives the source entry from
`manifest.main`: `./out/plugin.js` → `src/plugin.ts`.

`build:plugins` runs automatically as part of `predev`, `pretest`, `predist`,
and `build`, so a plain `npm run dev` compiles plugins before Electron starts.

Built-in plugins ship in production releases via `extraResources` (electron-builder
copies `resources/plugins/` → `plugins/` inside the app bundle). At runtime the
plugin host resolves plugin directories from `process.resourcesPath/plugins`.

---

## Scaffolding a new plugin

```bash
npm run plugin:new -- <name>
# optional: specify a different publisher
npm run plugin:new -- <name> --publisher acme
```

This creates `resources/plugins/<publisher>.<name>/` with a minimal `package.json`
and `src/plugin.ts` wired up with a single hello command. Edit from there, then
`npm run build:plugins` to compile.

See `resources/plugins/hello/` for a worked example with storage, configuration,
workspace events, and a webview panel.

---

## VS Code-compatible plugins

Plugins with `engines.vscode` and `require('vscode')` are supported via the
built-in VS Code compatibility shim. The shim currently covers command registration
(`vscode.commands.registerCommand/executeCommand`); tree views, webviews, and
authentication providers are deferred to later phases. VS Code-compatible plugins
are typically external/prebuilt extensions loaded from a sidecar path rather than
authored inside `resources/plugins/` — do not add a `src/` directory for them, as
the build script will attempt to compile them.
