# Loop-as-a-Plugin — Phase A: Privileged VS Code-shaped APIs — Design

**Status:** Design (approved direction). Implementation plan to follow via `writing-plans`.
**Date:** 2026-06-06
**Owner topic:** Converting Manifold's built-in **loop** feature into a real plugin.

---

## Why this exists

Loop today is a **built-in (internal) module**, not a plugin. Its UI is three native
React components (`LoopPanel`, `LoopConfigForm`, `LoopIterationList`) surfaced through
the renderer **contribution registry** (`source: 'internal'`), and its engine
(`src/main/loop/*`) runs in the main process with privileged access to git, the agent
session, an LLM judge, and a private `loop:*` IPC channel.

The goal is to **fully decouple loop from core** and ship it as a first-class plugin —
authored in `resources/plugins/manifold.loop/`, running in the extension host, rendering
its UI in a webview. We are doing this **in three phases**:

- **Phase A (this spec):** Build the privileged, capability-gated `manifold` APIs a
  decoupled loop will need. **Purely additive — core loop is untouched and stays green.**
- **Phase B:** Create `resources/plugins/manifold.loop/`; port the runner/eval/judge/
  iteration-log logic to run in the host (Node) against the Phase A APIs; port the UI to a
  webview bundle; run side-by-side with core loop for parity verification.
- **Phase C:** Flip the contribution from `internal` → `plugin`; delete `src/main/loop/*`,
  `loop-handlers.ts`, `src/renderer/components/loop/*`, and the internal-contribution entry;
  migrate persisted state.

This spec covers **Phase A only**.

### Guiding constraint (from the requester)

> Stay close to VS Code's API where one exists; invent a Manifold-specific API only where
> VS Code has no analog.

### Design enabler (verified)

The extension host is an Electron `utilityProcess.fork` — a **real Node.js process**
(`src/main/plugins/extension-host.ts`). The require interceptor
(`src/plugin-host/require-interceptor.ts`) intercepts **only** `manifold` and `vscode`;
every other `require` (Node built-ins, npm deps) passes through. Therefore plugins can run
`git`/shell/`fs` themselves via `node:child_process` and `node:fs` — exactly as VS Code
extensions do. This is why Phase A is small: most of loop's dependencies need **no new
host API** at all.

---

## What needs a host API, and what does not

Mapping loop's 7 injected adapters (`src/main/loop/loop-runner-types.ts`) to Phase A:

| Loop dependency | Phase A answer | New API? |
|---|---|---|
| git (commit/reset/diff/head/status) | plugin runs `git` via `node:child_process` | No |
| eval (run shell command) | plugin spawns via `node:child_process` | No |
| iteration log (file in worktree) | plugin uses `node:fs` | No |
| eval parse / score / prompt building | pure logic, ported into plugin | No |
| status/config persistence | existing `storage.global`, keyed by sessionId | No |
| **judge (one-shot LLM)** | **`manifold.lm`** (VS Code Language Model shape) | **Yes** |
| **worktree path of active session** | **`workspace.workspaceFolders`** (VS Code shape) | **Yes** |
| **drive agent + wait for turn end** | **`manifold.agents.activeAgent.runTurn`** (invented, VS Code-styled) | **Yes** |

Phase A therefore delivers exactly **three** API additions plus the capability/trust
plumbing to gate them.

---

## API contracts

All additions go in `src/shared/plugins/api-types.ts` (the single shared shape, consumed by
main, host, and the ambient `manifold` module declaration).

### 1. `manifold.agents` — drive the live agent *(new capability `agent:control`)*

The one invented API. VS Code has no "drive a coding agent / await its turn" concept, so we
use a VS Code-*style* noun (`AgentSession`) with a Manifold-specific method. The turn-end
heuristic stays server-side (it reads rapidly-changing session internals).

```ts
export interface CancellationToken {
  readonly isCancellationRequested: boolean
  onCancellationRequested(listener: () => void): Disposable
}

export interface AgentSession {
  readonly sessionId: string
  /** Send a prompt to the live agent and resolve when its turn ends. */
  runTurn(
    prompt: string,
    opts?: { budgetSeconds?: number; clearContext?: boolean },
    token?: CancellationToken,
  ): Promise<'ended' | 'timeout' | 'aborted'>
}

// added to ManifoldApi:
agents: { readonly activeAgent: AgentSession | undefined }
```

- `activeAgent` is `undefined` when no session is active. Its `sessionId` is the host's
  current active session (read from the existing host-side `WorkspaceContext`).
- `runTurn` semantics mirror loop's current `runOneIteration` prompt step:
  optional `/clear` (when `clearContext`), send `prompt`, send carriage return, then await
  the existing turn-end heuristic bounded by `budgetSeconds`.
- Returns `'ended' | 'timeout' | 'aborted'` — the exact union of the current
  `WaitForTurnEnd`.

### 2. `manifold.lm` — language model / the judge *(new capability `lm`)*

VS Code-faithful nouns (`selectChatModels` → `LanguageModelChat.sendRequest`), minimal for
Phase A: **non-streaming, single string in / string out** (loop's judge is one-shot).
Streaming (`sendRequest` returning an async-iterable) is deferred — noted in Out of Scope.

```ts
export interface LanguageModelChat {
  readonly id: string
  sendRequest(
    prompt: string,
    opts?: { timeoutMs?: number },
    token?: CancellationToken,
  ): Promise<{ text: string }>
}

// added to ManifoldApi:
lm: { selectChatModels(): Promise<LanguageModelChat[]> }
```

- `selectChatModels()` resolves to a single-element array describing the **active session's
  runtime model** (Phase A has no multi-model selection). Empty array if no active session.
- `sendRequest` runs a one-shot generation in the active session's worktree using that
  runtime.

### 3. `workspace.workspaceFolders` — worktree path *(extends existing `workspace:read`)*

```ts
export interface WorkspaceFolder {
  readonly name: string
  readonly uri: string   // absolute fs path of the worktree (VS Code uses Uri; we use a path string)
}

// added to ManifoldApi['workspace']:
readonly workspaceFolders: readonly WorkspaceFolder[] | undefined
```

- Reflects the **active session's worktree path**, surfaced as a single workspace folder.
- `undefined` when no active session. Existing `activeProject` / `activeSession` /
  `onDidChange*` are unchanged. Gated by the **existing** `workspace:read` capability (no
  new capability).

---

## Trust model & capabilities

`agent:control` and `lm` are powerful (drive any agent; invoke the model). They are gated
two ways:

1. **Capability declaration** — added to `CAPABILITIES` in `src/shared/plugins/manifest.ts`
   (the single source of truth). A plugin must declare the capability in its manifest.
2. **Builtin-origin restriction** — even when declared, `agent:control` and `lm` are granted
   **only** to plugins with `origin: 'builtin'` (tracked already on `PluginDescriptor` by the
   scanner). A `user`-origin plugin that declares them fails at the gated getter with a clear
   error (e.g. `"Capability 'agent:control' is restricted to built-in plugins"`).

`workspace:read` is unchanged (any plugin may declare it; `workspaceFolders` rides on it).

Enforcement lives in `buildGatedApi` (`src/plugin-host/gated-api.ts`), which gains the
plugin's `origin`. `CapabilityError` is reused; a sibling restriction error is added.

---

## Architecture & data flow

Every new API follows the **existing uniform RPC pattern** (see `commands`, `storage`,
`workspace` today). Nothing novel in the transport.

```
plugin code (host, Node)
  → manifold.agents.activeAgent.runTurn(...)        // host-side API object
  → endpoint.getProxy(HOST_AGENTS).$runTurn(sid,…)  // RPC over utilityProcess channel
  → ExtensionHost HOST_AGENTS service (main)        // registered in extension-host.ts
  → AgentControlService.runTurn(...)                // new main-side service
  → SessionManager.sendInput + createWaitForTurnEnd // existing core, reused read-only
```

- **`agents`**: host-side `agents` object reads the active `sessionId` from the existing
  host `WorkspaceContext`, then calls `HOST_AGENTS.$runTurn(sessionId, prompt, opts)` /
  `$cancelTurn(sessionId)`. Main routes to `AgentControlService`.
- **`lm`**: host-side `lm` object reads the active `sessionId`, calls
  `HOST_LM.$selectChatModels(sessionId)` and `HOST_LM.$sendRequest(sessionId, prompt, opts)`.
  Main routes to `LmService`.
- **`workspaceFolders`**: no new RPC. The active-context push
  (`PluginManager.setActiveContext` → `HOST … $setActiveContext`) is **enriched** with the
  session's worktree path (looked up via `SessionManager`); the host `WorkspaceContext`
  stores it and `makeApi()` exposes `workspaceFolders`.

### Cancellation

`runTurn`/`sendRequest` accept an optional VS Code-shaped `CancellationToken`. The host-side
API subscribes to the token; on cancellation it sends `HOST_AGENTS.$cancelTurn(sessionId)`
(resp. aborts the LM request). Main maps `sessionId` → the in-flight `AbortController` and
aborts it; `createWaitForTurnEnd` then returns `'aborted'`. This is how Phase B's loop
`stop()` will cancel a running turn.

---

## Component map (design-level; steps belong to the plan)

**Shared (`src/shared/plugins/`)**
- `api-types.ts` — add `CancellationToken`, `AgentSession`, `LanguageModelChat`,
  `WorkspaceFolder`; extend `ManifoldApi` with `agents` + `lm`; extend `workspace` with
  `workspaceFolders`.
- `rpc.ts` — add context constants `HOST_AGENTS`, `HOST_LM`.
- `manifest.ts` — add `'agent:control'`, `'lm'` to `CAPABILITIES`.

**Main (`src/main/plugins/` + wiring)**
- `agent-control-service.ts` *(new)* — `createAgentControlService(sessionManager)` →
  `{ runTurn(sessionId, prompt, opts), cancelTurn(sessionId) }`. Imports the existing
  `createWaitForTurnEnd` from `src/main/loop/loop-adapters.ts` (read-only reuse) and
  re-implements the ~6-line send sequence inline (core loop is not modified).
- `lm-service.ts` *(new)* — `createLmService(sessionManager, gitOps)` →
  `{ selectChatModels(sessionId), sendRequest(sessionId, prompt, opts) }`. Uses
  `getRuntimeById(session.runtimeId)` + `gitOps.aiGenerate(runtime, prompt, worktreePath,
  runtime.aiModelArgs ?? [], { silent: true, timeoutMs })`.
- `extension-host.ts` — register `HOST_AGENTS` and `HOST_LM` services; accept
  `sessionManager` + `gitOps` (new constructor deps).
- `plugin-manager.ts` — accept `sessionManager` + `gitOps`; pass them to `ExtensionHost`;
  thread `origin` into the `ActivationTarget` it builds; enrich `setActiveContext` session
  with `worktreePath` via `sessionManager`.
- `app/index.ts` — pass the already-constructed `sessionManager` + `gitOps` into
  `new PluginManager(...)`.

**Host (`src/plugin-host/`)**
- `activator.ts` — add `origin: 'builtin' | 'user'` to `ActivationTarget`.
- `agents-api.ts` *(new)* — `createAgentsApi(endpoint, workspaceContext)` → `{ activeAgent }`,
  with `CancellationToken` → `$cancelTurn` wiring.
- `lm-api.ts` *(new)* — `createLmApi(endpoint, workspaceContext)` → `{ selectChatModels }`.
- `workspace-api.ts` — store worktree path in `ActiveContext`; add `workspaceFolders` getter.
- `gated-api.ts` — add gated `agents` + `lm` getters (capability **and** builtin-origin
  check); `buildGatedApi` gains `origin`.
- `index.ts` — construct `agents-api` + `lm-api`; pass into `buildGatedApi` factories; pass
  `t.origin` through.

---

## Testing strategy

Unit tests first (TDD), colocated with each unit, run via the project test command (with the
`better-sqlite3` ABI rebuild handled by the runner):

- `agent-control-service.test.ts` — fake `SessionManager`: `runTurn` issues the correct
  input sequence (optional `/clear`, prompt, CR), returns the `WaitForTurnEnd` result;
  `cancelTurn` aborts an in-flight turn → `'aborted'`.
- `lm-service.test.ts` — fake `gitOps.aiGenerate` + `getRuntimeById`: `sendRequest` returns
  text; unknown session/runtime → descriptive failure; `timeoutMs` forwarded.
- `gated-api.test.ts` *(extend)* — `agents`/`lm` throw `CapabilityError` without the
  capability; throw the restriction error for `origin: 'user'` even with the capability;
  succeed for `origin: 'builtin'` + capability.
- `workspace-api.test.ts` *(extend)* — `workspaceFolders` reflects the active session's
  worktree path and is `undefined` with no active session.
- Extend `extension-host-integration.test.ts` / `extension-host-gated-integration.test.ts`
  for an end-to-end RPC round-trip of `$runTurn` and `$selectChatModels`/`$sendRequest`
  against fakes.

**Manual/dev harness:** a tiny builtin plugin (declaring `agent:control`, `lm`,
`workspace:read`) with a command that calls `runTurn` and `lm.sendRequest` against a live
session — proves the path in `npm run dev`. Removed or kept as a documented sample at the
end of Phase A (decision deferred to the plan).

---

## Verification gates

- All new + existing runtime tests green.
- `npm run typecheck:web` and `npm run typecheck:node`: **no new errors in touched files**
  beyond the current baselines (baselines are non-zero; confirm the number before/after).
- `docs/plugins/authoring.md` updated: document `agent:control` + `lm` capabilities (and
  their builtin-only restriction), the `manifold.agents` / `manifold.lm` surfaces, and
  `workspace.workspaceFolders`.
- Core loop untouched: `src/main/loop/*`, `loop-handlers.ts`, `src/renderer/components/loop/*`
  unchanged; loop still works exactly as before.

---

## Out of scope (Phase A)

- Moving any loop logic or UI (that is Phase B/C).
- Streaming `lm.sendRequest` (async-iterable), multi-model `selectChatModels` selectors,
  chat message arrays / roles, tool-calling — Phase A is one-shot string in/out only.
- A general `workspace.fs` or `git` host API — plugins use Node directly by design.
- Deactivation cleanup of `unregisterPluginApis` (pre-existing TODO, untouched).
- Enable/disable UX, Open VSX, user-plugin install — unrelated tracks.

---

## Self-review notes

- **Placeholders:** none — every new file/symbol is named and its reuse target identified.
- **Consistency:** the three APIs all reuse the existing RPC + gating pattern; `agent:control`
  & `lm` are gated identically (capability + builtin-origin); `workspaceFolders` deliberately
  rides existing `workspace:read`.
- **Scope:** additive only; core loop is explicitly out of scope and asserted untouched in the
  verification gates — keeps the change reviewable and green.
- **Ambiguity resolved:** "active session" for `agents`/`lm` is defined as the host
  `WorkspaceContext`'s current session id (single source); `lm` altitude fixed at one-shot;
  cancellation path fully specified via `$cancelTurn` + main-side `AbortController`.
