---
description: How Manifold groups several repositories into one Workspace so a single agent operates across all of them, each repo mounted via the runtime's multi-directory flag.
covers: [src/main/workspace]
updated: 2026-06-08
owner: see .github/CODEOWNERS
---

# Workspace — multi-repo agent grouping

A *workspace* bundles several projects (repos and/or plain folders) under one name so a
single agent session works across all of them at once. Spawning a workspace agent creates
one worktree per git repo on a shared branch, homes the agent in a chosen "primary" repo,
and passes the remaining roots to the runtime via its multi-directory flag
(`--add-dir` / `--include-directories`). This subsystem owns the persisted workspace list
and the working-set assembly; the actual worktree create/remove and the session lifecycle
live in `src/main/git` and `src/main/session` — this code only calls into them.

## Covered code

- `src/main/workspace/workspace-manager.ts` — `WorkspaceManager`, the façade: CRUD over workspaces plus `spawnAgent()`, which builds the working set and delegates to `SessionManager.createSession()`.
- `src/main/workspace/workspace-store.ts` — `WorkspaceStore`: the JSON-file-backed list of `Workspace` records (`~/.manifold/workspaces.json`).
- `src/main/workspace/workspace-worktrees.ts` — pure helpers: `findAvailableWorkspaceBranch()`, `buildWorkspaceWorkingSet()`, `removeWorkspaceWorktrees()`, and the `WorktreeSetManager` port.

Tests live alongside each file (`*.test.ts`). The runtime-flag translation itself is in `src/main/agent/working-set-args.ts` (`buildWorkingSetArgs`), not in this folder.

## How it works

`WorkspaceManager` is the only public entry point. Its constructor takes a `WorkspaceManagerDeps`
bag — `store`, `worktreeManager` (a `WorktreeSetManager`), `projectRegistry`, `sessionManager`,
and an `emitListChanged` callback — keeping it decoupled from the concrete managers
(`workspace-manager.ts:28`).

**Persist.** A `Workspace` is `{ id, name, projectIds[], createdAt, runtimeId? }`
(`src/shared/workspace-types.ts`). `projectIds` is *ordered*: `projectIds[0]` is the default
primary repo (the agent's cwd). `WorkspaceStore` loads the array from JSON on construction and
rewrites the whole file on every mutation (`workspace-store.ts:22`); a missing or corrupt file
yields an empty list (`workspace-store.ts:12`). `WorkspaceManager` mutates only through the
store and fires `emitListChanged` after each change so the renderer can refresh
(`workspace-manager.ts:43`). `create()` requires at least one project
(`workspace-manager.ts:35`); `removeProject()` refuses to empty a workspace — a repo-less
workspace can't spawn an agent (`workspace-manager.ts:63`).

**Resolve the project set.** `spawnAgent(workspaceId, options)` (`workspace-manager.ts:68`)
loads the workspace, maps each `projectId` through `projectRegistry.getProject()` into a
`WorkspaceProject` (`id`, `path`, `name`, `baseBranch`, `kind`), and throws on any unknown
project. If `options.homeProjectId` names a member, that repo is moved to the front so it
becomes the primary/cwd; otherwise the first repo stays primary (`workspace-manager.ts:81`).

**Pick a shared branch.** The base branch is `options.branchName ?? manifold/<slug(name)>`
(`workspace-manager.ts:87`). `findAvailableWorkspaceBranch()` (`workspace-worktrees.ts:25`)
then probes `branchExists` across *every git repo* in the set and returns the first candidate
free in all of them, suffixing `-2`, `-3`, … up to 1000 before throwing. Non-git folders are
skipped via `isGitProject` (`src/shared/project-kind.ts`).

**Build the working set.** `buildWorkspaceWorkingSet()` (`workspace-worktrees.ts:46`) walks the
ordered projects: each git repo gets a `createWorktree(path, baseBranch, name, branchName)` on
the shared branch; each non-git folder passes through using its own path. The result is a
`worktreePaths` map (`projectId → worktree-or-folder path`) and the ordered list split into
`primary` (first) + `additionalDirs` (rest). On any failure mid-loop it removes the worktrees
it already created and rethrows (`workspace-worktrees.ts:63`).

**Spawn.** `spawnAgent` hands the result to `sessionManager.createSession()` with
`projectId = projects[0].id`, `existingWorktreePath = primary`, `additionalDirs`,
`workspaceId`, `workspaceWorktreePaths = worktreePaths`, plus `runtimeId`, `prompt`, and
`nonInteractive` (`workspace-manager.ts:91`). The PTY is spawned with cwd = the primary
worktree; only the *additional* dirs need flags, which `buildWorkingSetArgs()` emits per
runtime — `--add-dir <dirs…>` (variadic) for Claude, repeated `--add-dir <dir>` for Codex /
Copilot, and `--include-directories a,b,c` for Gemini (`src/main/agent/working-set-args.ts:6`).
Interactive sessions only; in `nonInteractive` mode the session creator skips the flags
(`src/main/session/session-creator.ts:122`).

**Tear down.** The workspace code does not kill sessions itself. When the session is killed,
`SessionKiller` sees a non-empty `workspaceWorktreePaths` and calls `removeWorkspaceWorktrees()`
(`workspace-worktrees.ts:75`), which removes every git worktree in the set and deliberately
skips non-git passthrough paths (where `projectPath === worktreePath`) so a real source folder
is never deleted (`src/main/session/session-killer.ts:42`, `:74`).

## Key types and entry points

- `WorkspaceManager` — `workspace-manager.ts:28`. Public surface: `list`, `get`, `create`, `remove`, `addProject`, `removeProject`, `spawnAgent`.
- `Workspace` / `WorkspaceCreateOptions` / `WorkspaceSpawnAgentOptions` — `src/shared/workspace-types.ts`. `Workspace.projectIds` is ordered; `WorkspaceSpawnAgentOptions.homeProjectId` picks the primary repo.
- `WorkspaceStore` — `workspace-store.ts:5`. `list/get/add/update/remove/addProject/removeProject`, all persisting to one JSON file.
- `WorktreeSetManager` — `workspace-worktrees.ts:3`. The port the manager depends on (`createWorktree`, `removeWorktree`, `branchExists`); satisfied by `src/main/git`'s `WorktreeManager`.
- `findAvailableWorkspaceBranch` / `buildWorkspaceWorkingSet` / `removeWorkspaceWorktrees` — `workspace-worktrees.ts:25` / `:46` / `:75`.

## Interactions

- **Session** (`src/main/session`): `spawnAgent` calls `SessionManager.createSession()`; the resulting session carries `workspaceId`, `additionalDirs`, and `workspaceWorktreePaths` (`src/shared/types.ts:27`). `SessionCreator` persists those to worktree meta (`session-creator.ts:184`) so a discovered session re-surfaces the whole set, and `SessionKiller` removes the worktree set on teardown (`session-killer.ts:42`).
- **Git / worktrees** (`src/main/git`): the injected `WorktreeManager` provides `createWorktree` / `removeWorktree` / `branchExists` behind the `WorktreeSetManager` port.
- **Agent runtime** (`src/main/agent`): `buildWorkingSetArgs()` translates `additionalDirs` into the per-runtime multi-directory launch flags.
- **Store / projects** (`src/main/store`): `ProjectRegistry.getProject()` resolves each member's path/baseBranch/kind; `isGitProject` (`src/shared/project-kind.ts`) decides worktree vs. passthrough.
- **App wiring** (`src/main/app/index.ts:69`): constructs `WorkspaceStore` at `~/.manifold/workspaces.json` and `WorkspaceManager`, wiring `emitListChanged` to send `workspace:list-changed` to the renderer.
- **IPC** (`src/main/ipc/workspace-handlers.ts`): `workspace:list` / `:create` / `:remove` / `:add-project` / `:remove-project` / `:spawn-agent` map one-to-one onto the manager.

## Invariants & gotchas

- **A workspace is never empty.** `create()` rejects zero projects (`workspace-manager.ts:35`) and `removeProject()` no-ops on the last repo (`workspace-manager.ts:63`) — a repo-less workspace can't spawn an agent.
- **`projectIds` order is the default primary.** `projectIds[0]` is the agent cwd unless `homeProjectId` overrides it; an unknown `homeProjectId` silently falls back to the first repo (`workspace-manager.ts:81`).
- **The shared branch must be free in *all* git repos.** `findAvailableWorkspaceBranch` only returns a name unused across every member, so the same branch can be created in each worktree (`workspace-worktrees.ts:25`).
- **Working-set creation is all-or-nothing.** A failure partway through rolls back the worktrees already created before rethrowing (`workspace-worktrees.ts:63`).
- **Non-git folders are edited in place, never deleted.** They pass through as their own path on build and are explicitly skipped on removal where `projectPath === worktreePath` (`workspace-worktrees.ts:83`).
- **Extra-dir flags are interactive-only.** `--add-dir`/`--include-directories` are emitted only when `!nonInteractive` (`src/main/session/session-creator.ts:122`); chat/print-mode workspace agents don't get them.
- **`runtimeId` may be absent on old records.** Workspaces persisted before per-workspace runtimes carry no `runtimeId`; callers fall back to the global default (`src/shared/workspace-types.ts`).
