---
description: How Manifold groups repositories into a Workspace — a place to work that owns one checkout of every repo it spans, so agents join a workspace instead of cutting worktrees of their own.
covers: [src/main/workspace]
updated: 2026-08-27
owner: see .github/CODEOWNERS
---

# Workspace — a place to work across repos

A *workspace* bundles projects (repos and/or plain folders) under one name and **owns one
checkout of each of them**, so every agent in it works in the same place. It is the **only**
container a repo lives in — one spanning a single folder is the ordinary case, not a
degenerate one — so the sidebar has exactly one kind of root.

**A workspace is the unit of isolation; an agent is not.** There are two kinds:

- A **home workspace** (`worktreePaths` absent) *is* the repos' own clones — the workspace you
  get when you add a repository. Its agents edit the folder the user opened, on whatever
  branch is checked out there (`workspace-manager.ts:180`, `:243`).
- Every workspace created after that is a **worktree workspace**: its own git worktree of each
  repo, all on one `branchName`, cut when the workspace is created (`workspace-manager.ts:38`).

Making a second workspace over the same repos is how you get a second branch over them. There
is no worktree inside a worktree and no per-agent worktree, so a repo has exactly one place per
branch. The agent is homed in a chosen "primary" repo and the remaining roots reach the runtime
via its multi-directory flag (`--add-dir` / `--include-directories`). This subsystem owns the
persisted workspace list and the working-set assembly; the worktree create/remove and the
session lifecycle live in `src/main/git` and `src/main/session` — this code only calls into them.

## Covered code

- `src/main/workspace/workspace-manager.ts` — `WorkspaceManager`, the façade: CRUD over workspaces (each mutation keeping the checkouts in step) plus `spawnAgent()`, which joins an agent to the workspace's checkouts and delegates to `SessionManager.createSession()`.
- `src/main/workspace/workspace-store.ts` — `WorkspaceStore`: the JSON-file-backed list of `Workspace` records (`~/.manifold/workspaces.json`).
- `src/main/workspace/workspace-worktrees.ts` — pure helpers: `findAvailableWorkspaceBranch()`, `buildWorkspaceWorkingSet()`, `joinWorkspaceWorkingSet()`, `removeWorkspaceWorktrees()`, and the `WorktreeSetManager` port.
- `src/main/workspace/workspace-promotion.ts` — `promoteAgentWorktreesToWorkspaces()`, the one-way startup migration from the old per-agent worktrees to this model.

Tests live alongside each file (`*.test.ts`). The runtime-flag translation itself is in `src/main/agent/working-set-args.ts` (`buildWorkingSetArgs`), not in this folder.

## How it works

`WorkspaceManager` is the only public entry point. Its constructor takes a `WorkspaceManagerDeps`
bag — `store`, `worktreeManager` (a `WorktreeSetManager`), `projectRegistry`, `sessionManager`,
and an `emitListChanged` callback — keeping it decoupled from the concrete managers
(`workspace-manager.ts:30`).

**Persist.** A `Workspace` is `{ id, name, projectIds[], createdAt, runtimeId?, branchName?,
worktreePaths? }` (`src/shared/workspace-types.ts:9`). `projectIds` is *ordered*: `projectIds[0]`
is the default primary repo (the agent's cwd). The last two fields are what make a workspace a
place rather than a list — `worktreePaths` maps `projectId → this workspace's checkout of that
repo`, and both are absent on a home workspace, which is the clones themselves.
`WorkspaceStore` loads the array from JSON on construction and rewrites the whole file on every
mutation (`workspace-store.ts:22`); a missing or corrupt file yields an empty list
(`workspace-store.ts:12`). `WorkspaceManager` mutates only through the store and fires
`emitListChanged` after each change so the renderer can refresh.

**Create — cut the checkouts first.** `create()` is async because it makes a place to work
before it makes the record (`workspace-manager.ts:39`): it resolves the projects, picks a
branch free in all of them, calls `buildWorkspaceWorkingSet()`, and only then stores the
workspace with its `branchName` and `worktreePaths`. Doing it eagerly is what lets the sidebar
disclose a workspace's folders before any agent has run in it. It requires at least one project
(`:42`). Initial creation sets `absorbHomeWorkspaces`, so after the combined checkout exists it
removes each selected repo's empty, standalone one-folder home record (`AppShell.tsx:318`,
`workspace-manager.ts:58`, `:67`). Homes with agents, multi-folder homes, and worktree workspaces are preserved;
"New Workspace, Same Folders" omits the flag and therefore remains a deliberate parallel
checkout (`App.tsx:312`). `adoptProject()` / `adoptOrphanProjects()` are the exception: they
build a *home* workspace, which is the clone and so has nothing to cut
(`workspace-manager.ts:142`, `:154`, `:198`).

**Pick a shared branch.** The candidate is `manifold/<slug(name)>` (`workspace-manager.ts:42`).
`findAvailableWorkspaceBranch()` (`workspace-worktrees.ts:27`) probes `branchExists` across
*every git repo* in the set and returns the first candidate free in all of them, suffixing `-2`,
`-3`, … up to 1000 before throwing. Non-git folders are skipped via `isGitProject`
(`src/shared/project-kind.ts`). Two workspaces over the same repos therefore land on different
branches, which is what keeps them from conflicting.

**Build the working set.** `buildWorkspaceWorkingSet()` (`workspace-worktrees.ts:48`) walks the
ordered projects: each git repo gets a `createWorktree(path, baseBranch, name, branchName)` on
the shared branch; each non-git folder passes through using its own path. The result is a
`worktreePaths` map and the ordered list split into `primary` (first) + `additionalDirs` (rest).
On any failure mid-loop it removes the worktrees it already created *and* `deleteBranch`es the
shared branch in each (since `removeWorktree` keeps the branch), then rethrows — otherwise every
partial failure would leak `manifold/<name>` branches and push the next create to `-2`, `-3`
(`workspace-worktrees.ts:65`).

**Keep the set in step.** Membership changes move checkouts with them. `addProject()` cuts the
new repo's worktree on the workspace's existing branch and merges it into `worktreePaths`, so a
folder joining late is checked out like the rest instead of showing the clone
(`workspace-manager.ts:103`); on a home workspace there is nothing to cut. It joins through
`joinWorkspaceWorkingSet()` (`workspace-worktrees.ts:89`) rather than `buildWorkspaceWorkingSet()`,
because a repo joining late cannot pick its branch the way creation can — it has to land on the
one the workspace already spans. A repo that *already carries* that branch (a leftover from a
workspace since removed, or a folder removed and re-added) is therefore checked out on it via
`createWorktreeFromBranch` instead of `worktree add -b`, which would fail there and surface as a
folder that simply never appeared. It then absorbs the joining repo's home workspace under the
same rule as initial grouping (`workspace-manager.ts:117`, `:67`): otherwise the folder shows
twice in the sidebar, once in the workspace it joined and once in the card it came from.
`removeProject()` and
the project-deletion cascade `removeProjectFromAllWorkspaces()` both go through `dropWorktree()`,
which removes that repo's checkout and drops its entry (`:111`, `:149`, `:200`). All three are
async for that reason. `pruneMissingProjects()` heals records persisted before the cascade
existed; the repo is already gone from the registry, so its worktree can only be forgotten —
`git worktree remove` needs the clone it was cut from (`:163`).

**A late folder still has to reach the agents already running.** A session's `--add-dir` flags
are fixed when its process is spawned, so `addProject()` finishes by handing the new checkout to
`SessionManager.addWorkingDir()` (`workspace-manager.ts:124`) — the workspace's own checkout of
the repo, not the clone. What that does per agent is
[session's working-set propagation](session.md#pushing-a-folder-into-a-running-agent).

**Spawn — join, don't cut.** `spawnAgent(workspaceId, options)` (`workspace-manager.ts:218`)
resolves the members in their stored order and **reuses `workspace.worktreePaths`** rather than
creating anything (`:231`). Two agents in one workspace get the same paths, with the same first
folder as cwd — that is what makes a workspace a single place to work instead of a stack of
worktrees, and why nothing the user selects in the sidebar can move an agent to another folder.
It calls `sessionManager.createSession()` with `projectId = projects[0].id`, `additionalDirs`,
`workspaceId`, `workspaceWorktreePaths`, `branchName`, plus `runtimeId`, `nonInteractive` and
`displayName` — the name typed in the New Agent dialog, which only titles the agent's tab
(`session-creator.ts`); the prompt is empty, because nothing here asks for a task. The remaining option is the fork between the two kinds: a worktree workspace
passes `existingWorktreePath = primary`, while a home workspace passes
`noWorktree: true, stayOnBranch: true` so the agent works in the clone on whatever branch the
user has checked out there (`:243`). The PTY is spawned with cwd = the primary path; only the
*additional* dirs need flags, which `buildWorkingSetArgs()` emits per runtime — `--add-dir
<dirs…>` (variadic) for Claude, repeated `--add-dir <dir>` for Codex / Copilot, and
`--include-directories a,b,c` for Gemini (`src/main/agent/working-set-args.ts:6`). Print-mode
spawns get the same flags through `buildSimpleRuntimeCommand`, which places them before
`-p <prompt>` (`src/main/session/session-creator.ts:139`).

**Tear down.** Removing the *workspace* is what removes its checkouts: `remove()` calls
`removeWorkspaceWorktrees()` before dropping the record (`workspace-manager.ts:87`, `:192`;
`workspace-worktrees.ts:81`), which removes every git worktree in the set and deliberately skips
non-git passthrough paths (where `projectPath === worktreePath`) so a real source folder is
never deleted. If a member project was deregistered (its path is now unknown) it can't run `git
worktree remove`, but it still drops the `.manifold.json` meta sidecar so re-adding the project
later can't resurrect the dead worktree. **Closing an agent removes nothing** — its siblings are
still working in that checkout (`src/main/session/session-killer.ts:28`).

**Promote what came before.** Before this model, each agent cut a worktree of its own and
several stacked up inside one workspace. `promoteAgentWorktreesToWorkspaces()`
(`workspace-promotion.ts:32`) runs once per start, before the first window
(`app/index.ts`, `app/app-lifecycle.ts`), and turns every worktree on disk that no workspace
claims into the workspace it effectively already was: named after its branch, holding the repos
it spans, with the agents inside it rather than beside it. A multi-repo agent's whole set
becomes one workspace, since its `workspaceWorktreePaths` sidecar already recorded the set
(`workspace-promotion.ts:47`). It is idempotent — a claimed worktree is skipped — so a second
pass promotes nothing.

## Key types and entry points

- `WorkspaceManager` — `workspace-manager.ts:30`. Public surface: `list`, `get`, `create`, `rename`, `remove`, `addProject`, `removeProject`, `removeProjectFromAllWorkspaces`, `adoptProject`, `adoptOrphanProjects`, `pruneMissingProjects`, `spawnAgent`. Everything that touches a checkout — `create`, `remove`, `addProject`, `removeProject`, `removeProjectFromAllWorkspaces`, `spawnAgent` — is async.
- `Workspace` / `WorkspaceCreateOptions` / `WorkspaceSpawnAgentOptions` — `src/shared/workspace-types.ts:9`. `projectIds` is ordered; `branchName` + `worktreePaths` are present on a worktree workspace and absent on a home one; `projectIds[0]` is the primary repo. `WorkspaceCreateOptions.absorbHomeWorkspaces` marks initial grouping rather than deliberate parallel creation (`workspace-types.ts:69`). `WorkspaceSpawnAgentOptions` deliberately has neither a branch nor a home folder: the workspace owns both (`workspace-types.ts:78`).
- `WorkspaceRepoStatus` — `src/shared/workspace-types.ts:39`: one repo checkout's branch, staged/unstaged groups, and optional `upstreamAheadBehind`; the last field is absent when no configured upstream resolves (`workspace-types.ts:47`).
- `WorkspaceStore` — `workspace-store.ts:5`. `list/get/add/update/remove/addProject/removeProject`, all persisting to one JSON file.
- `WorktreeSetManager` — `workspace-worktrees.ts:4`. The port the manager depends on (`createWorktree`, `removeWorktree`, `deleteBranch`, `branchExists`); satisfied by `src/main/git`'s `WorktreeManager`.
- `findAvailableWorkspaceBranch` / `buildWorkspaceWorkingSet` / `joinWorkspaceWorkingSet` / `removeWorkspaceWorktrees` — `workspace-worktrees.ts:28` / `:49` / `:89` / `:103`.
- `promoteAgentWorktreesToWorkspaces` — `workspace-promotion.ts:32`. Startup migration; idempotent.

## Interactions

- **Session** (`src/main/session`): `spawnAgent` calls `SessionManager.createSession()`; the resulting session carries `workspaceId`, `additionalDirs`, and `workspaceWorktreePaths` (`src/shared/types.ts:27`). `SessionCreator` persists those to worktree meta (`session-creator.ts:184`) so a discovered session re-surfaces the whole set. Teardown runs the other way now: `SessionKiller` removes **no** worktrees, because the workspace owns them (`session-killer.ts:28`).
- **Git / worktrees** (`src/main/git`): the injected `WorktreeManager` provides `createWorktree` / `createWorktreeFromBranch` / `removeWorktree` / `deleteBranch` / `branchExists` behind the `WorktreeSetManager` port.
- **Agent runtime** (`src/main/agent`): `buildWorkingSetArgs()` translates `additionalDirs` into the per-runtime multi-directory launch flags.
- **Store / projects** (`src/main/store`): `ProjectRegistry.getProject()` resolves each member's path/baseBranch/kind; `isGitProject` (`src/shared/project-kind.ts`) decides worktree vs. passthrough.
- **App wiring** (`src/main/app/index.ts:69`): constructs `WorkspaceStore` at `~/.manifold/workspaces.json` and `WorkspaceManager`, wiring `emitListChanged` to send `workspace:list-changed` to the renderer, then runs `pruneMissingProjects()`. `promoteAgentWorktreesToWorkspaces()` runs from the `beforeFirstWindow` hook (`app/app-lifecycle.ts`), because the sidebar's first paint must already show the promoted workspaces.
- **IPC** (`src/main/ipc/workspace-handlers.ts`): `workspace:list` / `:create` / `:remove` / `:add-project` / `:remove-project` / `:spawn-agent` map one-to-one onto the manager. Project removal cascades in from outside this folder: `projects:remove` (`src/main/ipc/project-handlers.ts:194`) and `agent:delete-app` (`src/main/ipc/agent-handlers.ts:255`) both call `removeProjectFromAllWorkspaces()`.

## Invariants & gotchas

- **Every registered repo is held by a workspace from the moment it is registered.** `registerProject` places each newly added repo in the same step that registers it (`ipc/project-handlers.ts:64`): a home workspace of its own by default (`workspace-manager.ts:142`), or the workspace the caller named, when the folder is being added *to* one ("Add folder" on a workspace row). Startup wraps any repo the store doesn't hold (`:154`), and a named workspace that vanished before the click falls back to adoption — a repo no workspace holds has no row to appear in. A join that *throws* unregisters the repo again when this call is what registered it (`ipc/project-handlers.ts:73`), for the same reason: a registered repo in no workspace is invisible until the next launch adopts it as a stray card, so a failed add would leave half a folder behind. Grouping — at creation and on a later join alike — replaces each absorbed repo's empty, standalone one-folder home row only after the checkout is in place (`workspace-manager.ts:67`); it never removes multi-folder homes or other worktree workspaces. Adopting *and then* joining is the bug this replaced: it left the folder in two workspaces, so it showed twice in the sidebar, once as its own row on the clone and once inside the workspace on that workspace's branch. The same repo appearing in several workspaces is still the supported way to work on several branches of it at once — it just isn't something a single grouping action should produce.
  A one-folder home that still owns an agent is likewise preserved, so grouping repositories
  cannot orphan a running or restorable session (`workspace-manager.ts:69`).
- **An agent never owns a checkout.** `spawnAgent` only reuses `worktreePaths` (`workspace-manager.ts:231`) and `SessionKiller` removes nothing (`session-killer.ts:28`), so the only thing that removes a checkout is removing the workspace. This is what rules out a worktree nested inside a worktree.
- **A workspace is never empty.** `create()` rejects zero projects (`workspace-manager.ts:40`) and `removeProject()` no-ops on the last repo (`:115`). Deleting the *project* drops the workspace with it (`:157`, `:208`): with no folders it can neither spawn an agent nor disclose anything, so it would sit in the sidebar as an unusable card.
- **`projectIds[0]` is the agent cwd, always.** Nothing overrides it — the caller can't name a home folder — so every agent in a workspace runs in the same place with the same repos alongside (`workspace-manager.ts:226`).
- **The shared branch must be free in *all* git repos.** `findAvailableWorkspaceBranch` only returns a name unused across every member, so the same branch can be created in each worktree (`workspace-worktrees.ts:27`). It is also why a second workspace over the same repos gets `-2`: one branch, one place.
- **Working-set creation is all-or-nothing.** A failure partway through rolls back the worktrees already created before rethrowing (`workspace-worktrees.ts:65`). Since that runs inside `create()`, a failed create leaves no record either.
- **Promotion runs before the first window and only forward.** `promoteAgentWorktreesToWorkspaces` is idempotent and never un-promotes; a worktree already claimed by a workspace is skipped (`workspace-promotion.ts:33`).
- **Non-git folders are edited in place, never deleted.** They pass through as their own path on build and are explicitly skipped on removal where `projectPath === worktreePath` (`workspace-worktrees.ts:83`).
- **Extra-dir flags reach both modes, by different routes.** Interactive spawns append them to the base args (`session-creator.ts:147`); print-mode/chat spawns get them inside the command `buildSimpleRuntimeCommand` assembles, because the flags must precede `-p <prompt>` (`session-creator.ts:139`, `simple-runtime.ts:27`). A chat follow-up rebuilds the same command from the session's stored `additionalDirs` (`app/dev-server-manager.ts:190`), so the second turn spans the same repos as the first.
- **`runtimeId` may be absent on old records.** Workspaces persisted before per-workspace runtimes carry no `runtimeId`; callers fall back to the global default (`src/shared/workspace-types.ts`).
