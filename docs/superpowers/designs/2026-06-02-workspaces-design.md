# Workspaces — replacing the Superagent concept

**Status:** Design (awaiting review)
**Date:** 2026-06-02
**Supersedes:** `docs/superpowers/specs/2026-04-17-superagent-design.md` and `docs/superpowers/plans/2026-04-18-superagent.md`

## Summary

Replace the **Superagent** (an orchestrator AI that spawns and steers a fleet of child agents over an MCP bridge, with per-tool-call approval) with a **Workspace** — a passive, named group of repos, modelled on multi-root workspaces in VS Code / Cursor.

Cross-repo work no longer comes from one AI coordinating other AIs. It comes from **one agent whose working set is all the repos in the workspace**, injected into the runtime at launch through each CLI's native multi-directory flag — the same way Cursor "talks across repos." A workspace can host several such agents at once, each isolated in its own branch + worktrees.

This deletes the entire heavy coordination layer (orchestrator process, MCP bridge, approval broker) and reuses the existing agent-session and worktree plumbing.

## Motivation

The Superagent's value is **grouping multiple repos into one cross-repo context**. Its cost is the machinery that delivers that context: a second long-lived Claude process (the orchestrator), a Unix-socket JSON-RPC MCP bridge (`mcp-bridge-server.ts` + a generated `mcp-bridge.js`), an `ApprovalBroker` gating every `spawn_agent`/`send_prompt`/`stop_agent`, and an `ApprovalInbox` UI. This layer is complex and fragile to maintain.

The four supported runtimes can each take a multi-root working set **at launch**, so the orchestrator is unnecessary:

| Runtime | Extra repo roots | Working root | Verified |
|---|---|---|---|
| Claude Code | `--add-dir <a> <b> …` (variadic) | cwd | `claude --help` |
| Codex | `--add-dir <dir>` (writable, repeatable) | `-C/--cd <dir>` | `codex --help` |
| Copilot | `--add-dir <dir>` (repeatable) | `-C <dir>` | `copilot --help` |
| Gemini | `--include-directories a,b,c` (or repeated) | cwd | docs¹ |

¹ Gemini is not installed in the dev environment; capability confirmed from the Gemini CLI docs (`--include-directories`, `/directory`). Verify the exact arg form during implementation.

Today Manifold *scrapes* added directories back out of Claude Code's terminal output (`src/main/fs/add-dir-detector.ts` matches `Added <path> as a working directory`) and stores them on the session as `additionalDirs`. The design **inverts** this: the workspace declares the repo set, and each launcher *pushes* it into the runtime via the flag above. Every existing `additionalDirs` consumer — ripgrep search scope (`search-engine.ts`), file-tree/file access checks (`file-handlers.ts`), file watching (`session-killer.ts`) — keeps working unchanged and gains multi-root coverage for free.

## Non-goals (YAGNI)

- **No coordinator / orchestrator of any kind.** No AI spawns or steers other agents. Removed, not re-implemented.
- **No approval gating / ApprovalInbox.** Workspace agents are normal agents; they use whatever per-agent permission model the runtime already uses (e.g. `bypassPermissions`).
- **No VS Code settings/trust/storage layering.** We adopt only the *multi-root grouping*, not workspace-scoped settings, trust, or storage.
- **No primary-repo reordering UI** in v1 (primary = first project; can add later).

## Core model

### Workspace

A passive, persisted grouping of existing Manifold projects. It owns **no** process, branch, or worktrees of its own.

```ts
// src/shared/workspace-types.ts
export interface Workspace {
  id: string
  name: string
  projectIds: string[]   // ordered; projectIds[0] is the default primary repo
  createdAt: string
}

export interface WorkspaceCreateOptions {
  name: string
  projectIds: string[]   // must contain ≥ 1 project
}
```

Persisted at `~/.manifold/workspaces.json` (a central store, mirroring the existing `superagents.json` pattern). *Alternative considered:* VS Code-style per-file `.manifold-workspace` documents — deferred to keep parity with Manifold's existing central-JSON stores and avoid file-location/portability scope.

### Agents in a workspace (Approach A — per-agent worktree isolation)

When you create an agent in a workspace, you pick a **runtime** and a **branch name**. Manifold then, for each project in `workspace.projectIds`:

- **git repo** → ensures a git worktree of that branch exists for the repo (reusing the existing per-repo worktree path scheme), creating the branch if needed.
- **non-git folder** → uses the folder path directly (edited in place; matches current fleet handling of non-git projects).

The resulting paths form the agent's **working set**:

- **primary cwd** = the worktree (or folder) of `projectIds[0]`,
- **`additionalDirs`** = the worktrees/folders of the remaining projects.

The runtime is launched with the working set injected via its flag (table above). The agent reads and edits across all of them natively.

Several agents in one workspace = several branches, each with its own worktree set → **full isolation, full parallelism, true cross-repo**. Two agents never collide: different branches mean different worktrees in each repo, and a given branch is checked out in at most one worktree per repo.

```
Workspace "auth-refactor"  { projectIds: [api, web, shared] }
 ├─ Agent X  branch=manifold/x   working set = [api@x, web@x, shared@x]   (cwd=api@x)
 └─ Agent Y  branch=manifold/y   working set = [api@y, web@y, shared@y]   (cwd=api@y)
```

`AgentSession` gains `workspaceId?: string` (replacing the removed `parentSuperagentId`). The same field is added to `WorktreeMeta` so worktrees can be traced back to their workspace on discovery.

## Architecture & components

### New modules (main)

- **`src/shared/workspace-types.ts`** — `Workspace`, `WorkspaceCreateOptions`. (Replaces `superagent-types.ts`; `ApprovalRequest/Response/ApprovalToolName` are dropped.)
- **`src/main/workspace/workspace-store.ts`** (+test) — JSON persistence at `~/.manifold/workspaces.json`: `list/get/add/update/remove/addProject/removeProject`. Tolerates a malformed file by starting empty. Lifted from `SuperagentStore`, minus orchestrator fields.
- **`src/main/workspace/workspace-worktrees.ts`** (+test) — pure-ish helper: given a `Workspace` + branch name, ensure a worktree per git repo and return the ordered working-set paths (`{ primary, additionalDirs }`). Extracted from the reusable half of `superagent-fleet.ts` (`createFleetWorktrees`), re-keyed per-agent.
- **`src/main/agent/working-set-args.ts`** (+test) — **the crux.** Pure function:
  ```ts
  buildWorkingSetArgs(runtimeId, primaryDir, additionalDirs): { cwd: string; extraArgs: string[] }
  ```
  Per-runtime mapping:
  - `claude`  → `{ cwd: primaryDir, extraArgs: ['--add-dir', ...additionalDirs] }`
  - `codex`   → `{ cwd: primaryDir, extraArgs: ['--cd', primaryDir, ...additionalDirs.flatMap(d => ['--add-dir', d])] }`
  - `copilot` → `{ cwd: primaryDir, extraArgs: additionalDirs.flatMap(d => ['--add-dir', d]) }`
  - `gemini`  → `{ cwd: primaryDir, extraArgs: additionalDirs.length ? ['--include-directories', additionalDirs.join(',')] : [] }`
  - default/unknown → `{ cwd: primaryDir, extraArgs: [] }` (single-root fallback)
- **`src/main/workspace/workspace-manager.ts`** (+test) — lifecycle:
  - `create(options)` / `list()` / `remove(id)` / `addProject` / `removeProject`
  - `spawnAgent(workspaceId, { runtimeId, branchName })` → calls `workspace-worktrees` to build the working set, then the existing session-creation path with `workspaceId` + working set. Returns the created `AgentSession`.
- **`src/main/ipc/workspace-handlers.ts`** — IPC: `workspace:list|create|remove|add-project|remove-project|spawn-agent`. Emits `workspace:list-changed`.

### New modules (renderer)

- **`src/renderer/components/sidebar/WorkspaceList.tsx`** (+styles) — replaces `SuperagentList` + `ActiveSuperagentGroup`. A "Workspaces" section; each workspace expands to show its repos and the agents currently running in it, with a **New agent** affordance and add/remove-project controls.
- **`src/renderer/components/modals/NewWorkspaceModal.tsx`** (+styles) — name + multi-select projects. (No runtime/`orchestratorCapable` filter — runtime is chosen per-agent.)
- **`src/renderer/hooks/useWorkspaces.ts`** (+test) — list / create / remove / addProject / spawnAgent. Replaces `useSuperagents`.
- Creating an agent in a workspace **reuses the normal New-Agent flow** (runtime + branch picker), pre-seeded with the workspace so the working set is derived automatically.

### Reused unchanged

- Agent-session runtime/PTY, status detection, streaming, persistence.
- `additionalDirs` and all its consumers (search, file access, file watching, file tree). The multi-root file tree a workspace agent sees is just its working set — already handled via `additionalDirs`.
- Normal agent dock panel/editor (no ApprovalInbox).

## Data flow

**Create workspace:** `NewWorkspaceModal` → `workspace:create` → `WorkspaceManager.create` → `WorkspaceStore.add` → `workspace:list-changed` → sidebar updates. No process is started.

**Spawn agent in workspace:**
```
WorkspaceList "New agent" (runtime + branch)
  → workspace:spawn-agent
  → WorkspaceManager.spawnAgent
      → workspace-worktrees: ensure branch worktree per repo  → { primary, additionalDirs }
      → working-set-args: (runtimeId, primary, additionalDirs) → { cwd, extraArgs }
      → SessionCreator.create({ workspaceId, runtimeId, branchName, cwd, additionalDirs, extraArgs })
          → spawn PTY with extraArgs (multi-root injected)
  → normal AgentSession appears as a dock tab; edits/reads span all repos
```

**Edit across repos:** the agent's own file tools operate on its worktree set; Manifold's editor/file IPC already permits access under `additionalDirs` (`file-handlers.ts:18`), so cross-repo file open/save needs no change.

**Teardown:** killing/removing the agent removes **all** of its worktrees (primary + each sibling worktree it owns), not just one. `session-killer.ts` / teardown is extended to iterate the agent's full worktree set. Removing a workspace removes its agents first, then the workspace record.

## What gets deleted

- `src/main/superagent/orchestrator-mcp-server.ts` (+test)
- `src/main/superagent/orchestrator-prompt.ts`
- `src/main/superagent/approval-broker.ts` (+test)
- `src/main/superagent/mcp-bridge-server.ts` (+test), `src/main/superagent/mcp-bridge-script.ts`
- `src/main/superagent/runtime-launchers/` (claude/codex/copilot/gemini orchestrator launchers + `types.ts` + `index.ts` + tests)
- `src/main/superagent/superagent-manager.ts`, `superagent-store.ts`, `superagent-coordination.ts`, `superagent-fleet-ops.ts` (fleet-worktree creation salvaged into `workspace-worktrees.ts`; the orchestrator/fleet-status logic is dropped)
- `src/main/ipc/superagent-handlers.ts`, `src/main/ipc/superagent-file-handlers.ts` (the latter folded away — per-session `file-handlers.ts` already covers multi-root access)
- Renderer: `ApprovalInbox.tsx` (+styles), `SuperagentAgentPanel.tsx` (replaced by the normal agent panel), `SuperagentFleetTree.tsx`, `useApprovalInbox.ts`, `useSuperagents.ts`, `NewSuperagentModal.tsx`
- `@modelcontextprotocol/sdk` dependency in `package.json`

## What gets modified

- `src/shared/types.ts` — add `AgentSession.workspaceId?`; remove `parentSuperagentId` (and `SpawnAgentOptions.parentSuperagentId`).
- `src/main/git/worktree-meta.ts` — `workspaceId?` replaces `parentSuperagentId`.
- `src/main/session/session-creator.ts` — accept `workspaceId` + a pre-built working set; thread `extraArgs` into the PTY launch. **When `workspaceId` is set, worktree creation is owned by `workspace-worktrees` (all repos at once); session-creator must *not* also create its own single-repo worktree — it consumes the provided `cwd`/`additionalDirs` as-is.**
- `src/main/session/session-killer.ts` / teardown — remove the agent's full worktree set.
- `src/main/session/session-discovery.ts`, `session-meta-persister.ts`, `session-public.ts` — persist/restore `workspaceId` and the working set.
- `src/main/app/index.ts`, `src/main/app/ipc-handlers.ts`, `src/main/ipc/types.ts` — instantiate `WorkspaceStore`/`WorkspaceManager`; register `workspace` handlers; drop superagent deps.
- `src/preload/index.ts` — channel allowlists `superagent:*` → `workspace:*`.
- `src/renderer/App.tsx` — render a workspace agent as a normal agent tab (drop the superagent branch).
- `src/renderer/components/sidebar/ProjectSidebar.tsx` — mount `WorkspaceList`.
- `src/renderer/DockTab.tsx` — drop the "S" orchestrator badge; optional small workspace chip on workspace agents.

> Several touched files (`session-creator.ts`, `App.tsx`, sidebar) are already sizeable; the net change is a **reduction** in surface area. Keep new modules small and focused (project guideline: split files approaching ~300 LOC).

## Migration

Existing superagents are experimental and their orchestrator state is meaningless without the machinery, so migration is **best-effort and non-fatal**:

1. On first run after upgrade, if `~/.manifold/superagents.json` exists, convert each Superagent → `Workspace { name, projectIds: fleetProjectIds }`.
2. Any `AgentSession`/worktree with `parentSuperagentId` set gets `workspaceId` = the new workspace id.
3. Leave `superagents.json` in place (ignored) or rename to `superagents.json.bak`. Do not block startup on any failure here.

## Testing strategy

Per the project testing skill (vitest; `npx vitest run <file>`; `better-sqlite3` ABI rebuild before suites; renderer baseline has known pre-existing type errors).

- **`working-set-args.test.ts`** — the per-runtime mapping for all four runtimes + the single-root fallback. Highest-value unit test.
- **`workspace-store.test.ts`** — persist/reload/update/remove/add-project; malformed-file tolerance.
- **`workspace-worktrees.test.ts`** — creates one worktree per git repo on the branch; non-git folders pass through; returns ordered `{ primary, additionalDirs }`.
- **`workspace-manager.test.ts`** — `create` rejects empty project list; `spawnAgent` builds the working set and calls session creation with `workspaceId` + injected args; `remove` tears down agents then the record.
- **`useWorkspaces.test.ts`** — list/create/remove/spawn round-trips over mocked IPC.
- Existing session/search/file-handlers tests already exercise `additionalDirs` and continue to pass.

## Risks & open questions

- **Worktree volume.** Cost is agents × repos worktrees on disk — inherent to per-agent isolation. Acceptable; mention in UI if it becomes large.
- **Codex sandbox.** `--add-dir` marks dirs writable, but Codex also has a sandbox mode (`-s workspace-write` / `--full-auto`). Confirm the interactive launch grants write access to all working-set dirs.
- **Gemini.** Not installable in dev; rely on docs and verify the exact `--include-directories` form (comma list vs repeated) against the installed binary in CI/manual test.
- **Non-git folders** are edited in place (no branch/worktree). Acceptable and matches current behavior; flag to the user that those edits aren't isolated.
- **Branch naming.** Reuse the existing per-agent branch-name generation; ensure uniqueness across agents in the same workspace.

## Success criteria

1. Create a workspace of ≥ 2 repos; it persists and reloads with no process started.
2. Spawn a Claude agent in it → a worktree appears per repo on the agent's branch; the agent can read a file in repo A and edit a file in repo B in one turn.
3. Repeat for Codex, Copilot, and Gemini (working set injected via each CLI's flag).
4. Spawn a second agent in the same workspace on a different branch → both run in parallel without touching each other's worktrees.
5. Removing an agent removes exactly its own worktrees; removing the workspace cleans up all of them.
6. No `orchestrator-*`, `mcp-bridge-*`, `approval-*` code or `@modelcontextprotocol/sdk` remain; `npm run typecheck:web && npm run typecheck:node` and the changed-file tests pass.
