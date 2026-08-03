---
description: How Manifold's main-process services are exposed to the renderer over Electron IPC — the channel namespaces, the handler registration pattern, and how handlers delegate to subsystem managers.
covers: [src/main/ipc]
updated: 2026-08-03
owner: see .github/CODEOWNERS
---

# IPC — the renderer↔main request seam

Every renderer request that needs main-process state or privileges (spawning an agent,
reading a file, running git, searching memory) crosses this layer. Each module here
registers a group of `ipcMain.handle(channel, …)` callbacks for one namespace, validates
arguments, and delegates to a subsystem manager pulled from a shared `IpcDependencies`
bag. The handlers hold almost no logic of their own — they are the thin, typed seam
between the preload bridge (which whitelists the renderer side, see `preload.md`) and the
managers documented on the other architecture pages (`session.md`, `git.md`, etc.).

## Covered code

- `src/main/app/ipc-handlers.ts` — `registerIpcHandlers(deps)`, the single entry point that calls every `register*Handlers` function in order and inlines a few one-off channels (`font:load-data`, `app:version`, `updater:*`, `release-notes:*`).
- `src/main/ipc/types.ts` — `IpcDependencies` (the manager bag passed to every handler module) and `resolveSession()` (throw-on-missing session lookup).
- `src/main/ipc/agent-handlers.ts` — `agent:*` lifecycle, plus `branch:suggest`, `shell:*`, and the read-only `git:list-*`/`git:fetch-pr-branch` channels.
- `src/main/ipc/chat-image-handlers.ts` — `chat:save-pasted-image`/`chat:read-pasted-image` and the allow-listed image-path resolution they share.
- `src/main/ipc/git-handlers.ts` — `diff:*`, `pr:create`, and the mutating `git:*` channels (`git:commit`, `git:ai-generate`, `git:ahead-behind`, `git:resolve-conflict`, `git:pr-context`, `git:fetch`, `git:has-uncommitted-changes`), plus the workspace-scoped Source Control channels: read-only `git:workspace-status` (branch + uncommitted changes for every repo checkout of a workspace), `git:workspace-commit` (per-repo stage-all commit through `gitOps.commit`), `git:workspace-checkout` (switch or `-b`-create a branch in one checkout, serialized by `withRepoLock`, emitting `workspace:list-changed` so the sidebar re-reads its branch badges), and `git:workspace-file-diff` (one file's uncommitted diff + HEAD original, for the editor's SCM-click diff). The session-scoped comparisons (diff, PR target, ahead/behind, pr-context) use `baseBranchFor(session, project)` = `session.baseBranch || project.baseBranch`, so a no-worktree agent based off a selected branch compares against that branch.
- `src/main/ipc/file-handlers.ts` — `files:*` tree/read/write/rename/import/paste/reveal/search, all path-guarded against traversal.
- `src/main/ipc/open-terminal.ts` — platform command selection for the path-guarded `files:open-terminal` channel: macOS `open`, Linux `x-terminal-emulator`.
- `src/main/ipc/project-handlers.ts` — `projects:*` (list/add/clone/create-new/remove/update) and the `*-dialog` + `storage:open-dialog` native-dialog channels.
- `src/main/ipc/settings-handlers.ts` — `settings:*`, `runtimes:list`, `ollama:list-models`, `view-state:*`, `shell-tabs:*`, `dock-layout:*`. Also keeps the zsh prompt-segments file in sync with settings (`settings-handlers.ts:16`) so live shells follow prompt-segment changes.
- `src/main/ipc/search-handlers.ts` — `search:context`, `search:query`, `search:ask`, `search:view-state:*`.
- `src/main/ipc/memory-handlers.ts` — `memory:*` (search/get/timeline/stats/delete/clear/settings), running SQLite FTS5 queries.
- `src/main/ipc/simple-handlers.ts` — `simple:*` chat-adapter channels for the developer draft chat (`chat-messages`, `send-message`, `subscribe-chat`, status/preview/slash-command getters).
- `src/main/ipc/workspace-handlers.ts` — `workspace:*` multi-root workspace ops.
- `src/main/ipc/plugin-handlers.ts` — `plugins:*` view/contribution/config/tree-view bridge. Verdicts are no longer read over renderer IPC: the `manifold.statistics` plugin reads them through the built-in `verdicts:read` capability (`HOST_VERDICTS`, see `plugins.md`).

Most handler modules ship a sibling `*.test.ts` exercising its channels in isolation (the `register*Handlers` functions are unit-testable against a mock `IpcDependencies`).

## How it works

**One registration pass.** `window-factory.ts` calls `registerIpcHandlers(deps.ipcDeps)`
behind an `ipcHandlersRegistered` guard, so it runs exactly once for the process even when
a second window is built (`window-factory.ts:100`). `registerIpcHandlers()` (`ipc-handlers.ts:22`) then invokes
every `register*Handlers(deps)` in sequence — there is no dynamic discovery or channel
registry; the list is hand-maintained. A handful of trivial channels are registered inline
in the same function rather than in their own module (`ipc-handlers.ts:44`–`:78`).

**The dependency bag.** All managers a handler might need are assembled once into
`IpcDependencies` (`types.ts:21`) — `sessionManager`, `projectRegistry`, `settingsStore`,
`fileWatcher`, `diffProvider`, `prCreator`, `gitOps`, `branchCheckout`, the various view/
layout/shell-tab stores, `chatAdapter`, `memoryStore`, `workspaceManager`,
`pluginManager`, `verdictStore`/`verdictRecorder`, etc. Each
`register*Handlers` destructures the few it needs and closes over them, so handlers never
reach for globals (`agent-handlers.ts:64`, `git-handlers.ts:62`).

**Request/response only.** Every channel in this layer uses `ipcMain.handle` (promise-returning
request/response), never `ipcMain.on`. Push notifications flow the *other* way, out of band:
handlers (or the managers they call) emit via `webContents.send` / `event.sender.send`.
Examples: `settings:changed` is broadcast to all live windows after `settings:update`
(`settings-handlers.ts:36`) and `simple:chat-message` is pushed per chat subscription
(`simple-handlers.ts:69`). `SessionManager` separately pushes
`agent:output`/`agent:status`/`agent:sessions-changed` through its own `sendToRenderer`
(see `session.md`).

**Delegation, not logic.** The body of a handler is typically: resolve a project/session,
guard it, call one manager method, return its result. `agent:spawn` resolves the project,
enforces one in-place agent per repo via `focusOrClearInPlaceSessions` (focuses an existing live
in-place session for the same/no target, throws if a different branch/PR is requested, else clears
finished in-place sessions), then calls `sessionManager.createSession()`, starts the file watch,
and returns the session; concurrent no-worktree spawns per project are serialized
(`agent-handlers.ts`). `git:commit` resolves the
session, rejects plain-folder projects, and calls `gitOps.commit()` (`git-handlers.ts:64`).
`git:has-uncommitted-changes` resolves the project and returns whether `git status --porcelain`
is non-empty (used by the New Agent form's dirty-repo confirmation).
`search:query` runs `executeSearchQuery` then `maybeRerankSearchResults`
(`search-handlers.ts:94`). The substantive work lives in the managers.

**Validation at the boundary.** Handlers are where untrusted renderer input is checked.
`file-handlers.ts` resolves every path and rejects anything outside the folders the user has
open — **the workspace roots**: every registered project path, **every workspace's checkout of
each repo**, plus every session's worktree and `additionalDirs` (`workspaceRoots`,
`file-handlers.ts:29`; `isAllowed`, `:52`; enforced on `files:read`, `files:write`,
`files:delete`, `files:rename`, etc.). The workspace's checkouts are listed in their own right,
not merely through the sessions working in them, because a workspace is browsable from the
moment it exists — before any agent has run in it. It is deliberately *not* scoped to the
selected session: the sidebar hangs a tree under every repo, all open at once, and a click there
opens a file without first selecting its repo. Reading, saving and revealing take the session id
as an optional hint for resolving a relative path and work with none at all
(`authorize`, `:59`). One repo can be open in several workspaces at once, each with its own
checkout, so `files:tree-by-project` takes an optional `workspaceId` that decides *which*
checkout's files come back; without it the repo's own clone answers (`file-handlers.ts:75`).
`chat-image-handlers.ts`
restricts pasted/read-back chat images to a small allow-list of directories
(`resolveReadableChatImagePath`, `chat-image-handlers.ts:26`). `project-handlers.ts` rejects
clone URLs beginning with `-` to avoid argument injection into `git clone`
(`project-handlers.ts:69`). Several handlers reject non-git projects with an explicit error
(`isGitProject` checks throughout `git-handlers.ts` and `agent-handlers.ts`).
`files:open-terminal` applies the same path guard before `openTerminal()` launches a detached
platform process without a shell (`file-handlers.ts:229`, `open-terminal.ts:12-60`).

## Key types and entry points

- `registerIpcHandlers(deps)` — `ipc-handlers.ts:22`. The only thing the app boot calls; registers everything.
- `IpcDependencies` — `types.ts:21`. The manager bag; the contract between the IPC layer and every subsystem. `send?` is the optional renderer-push hook used by `plugin-handlers.ts`.
- `resolveSession(sessionManager, id)` — `types.ts:45`. Shared helper that returns an `AgentSession` or throws `Session not found`; used by the mutating git handlers.
- `register*Handlers(deps)` — one per module (e.g. `registerAgentHandlers`, `agent-handlers.ts:63`). Each owns one namespace and is independently unit-tested.

## Interactions

- **Session** (`src/main/session`): the busiest consumer. `agent:spawn`→`createSession`, `agent:resume`→`resumeSession`, and `agent:configure`→`configureSession` (rename-only in place, or a confirmed runtime/view replacement with a new session id). `agent:kill`→killer (it additionally records a `DismissedAgentsStore` tombstone for `noWorktree` sessions so discovery won't resurrect a deleted agent from branch state, #679), `agent:sessions`→discovery, `agent:replay`→`getOutputBuffer`, `agent:input`/`agent:interrupt`/`agent:resize`, plus all `shell:*` and `simple:*` channels (`agent-handlers.ts`).
- **There is no `agent:kill-worktree`.** A checkout belongs to a workspace, not to the agents in it, so the channel that deleted one from an agent row is gone from the handlers and from the preload allowlist. Removing a checkout is `workspace:remove` (`ipc/workspace-handlers.ts`, `workspace/workspace-manager.ts:69`).
- **Legacy locks** (`src/main/ipc/agent-handlers.ts`): `agent:set-locked` remains registered for compatibility with older persisted sessions and clients, but `agent:kill` no longer gates deletion on that retired flag.
- **Git** (`src/main/git`): `gitOps`, `diffProvider`, `prCreator`, `branchCheckout` back the `git:*`, `diff:*`, and `pr:create` channels. `branch:suggest` uses `generateBranchName` (`agent-handlers.ts:66`).
- **FS** (`src/main/fs`): `fileWatcher` backs every `files:*` channel and the file-tree responses; `agent:spawn` starts the watch, and teardown unwatch is owned by `SessionKiller.cleanupSession` (guarded by shared-path liveness) rather than the `agent:kill` handler, so killing one session can't stop polling for a sibling on the same worktree. `agent:delete-app` still unwatches the path explicitly.
- **Store** (`src/main/store`): `projectRegistry`, `settingsStore`, `viewStateStore`, `shellTabStore`, `dockLayoutStore`, `searchViewStore`, `verdictStore` are all reached only through their handler namespaces.
- **Memory / search** (`src/main/memory`, `src/main/search`): `memory:*` queries the per-project SQLite DB directly (`memoryStore.getDb`, `memory-handlers.ts:97`); `search:*` calls the search services with `memoryStore` + `gitOps`.
- **Plugins** (`src/main/plugins`): `plugins:*` is a near-1:1 bridge onto `PluginManager`, including a renderer→host webview channel (`plugins:webview-to-host`) and a host→renderer push (`plugins:contributions-changed`).
- **Preload / renderer** (`src/preload`): the preload bridge whitelists which channels the renderer may `invoke` and which events it may subscribe to. The channel strings here are the source of truth that the preload allow-list mirrors — see `preload.md`.

## Invariants & gotchas

- **The registration list is manual.** Adding a namespace means writing a `register*Handlers` function *and* wiring it into `registerIpcHandlers` (`ipc-handlers.ts:22`). A forgotten line silently leaves the channels unregistered, and the renderer call rejects with "No handler registered".
- **This layer is `handle`-only; events go the other way.** Don't add `ipcMain.on` here. Renderer→main is request/response; main→renderer is `webContents.send`. Mixing the two in one channel breaks the preload allow-list model.
- **Path guards live in the handler, not the manager.** `fileWatcher` will read/write whatever absolute path it's given; the traversal guard is `isAllowed`/`authorize` in `file-handlers.ts`, resolved against the workspace roots. A new `files:*` channel that skips it is an arbitrary-file-access hole.
- **Handlers must tolerate a missing session.** Sessions can be torn down mid-flight while a renderer refresh is in flight; `diff:get` returns an empty diff rather than throwing for exactly this race (`git-handlers.ts:15`), whereas `resolveSession`-based channels deliberately throw.
- **Plain-folder projects reject git channels.** Most `git:*`/`diff:*`/`pr:create` handlers guard with `isGitProject` and either throw or return an empty result; do the same for any new git-touching channel.
- **Removing a project must drop its derived stores and references.** A project id is a fresh uuid on every add, so anything keyed by it (verdicts, chat, memory, agent dismissals, workspace membership) is unreachable once the project is removed and re-added. `projects:remove` therefore deletes the verdict/chat/memory/dismissal data and detaches the id from every workspace (`project-handlers.ts:191`–`:195`) but leaves the on-disk repo in place; only `agent:delete-app` additionally `fs.rm`s the project directory (`project-handlers.ts:185`, `agent-handlers.ts:150`).
- **Registration is once-per-process, and must stay that way.** Channels are global to the main process and `ipcMain.handle` throws if a channel is registered twice, so the `ipcHandlersRegistered` guard in `window-factory.ts:100` ensures a second window does *not* re-register. New handler modules must be idempotent-by-omission: register in `registerIpcHandlers`, nowhere else.
