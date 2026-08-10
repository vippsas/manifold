---
description: How Manifold creates, lists, and removes git worktrees, checks out branches/PRs, persists per-session worktree meta, and runs raw git/gh for commits, diffs, and PR creation.
covers: [src/main/git]
updated: 2026-08-10
owner: see .github/CODEOWNERS
---

# Git — worktrees, branches, and raw git/gh exec

Work that isn't in a repo's own clone happens in a *worktree*: a checked-out working tree on a
fresh branch, parked under the user's storage path rather than inside the repo. A worktree
belongs to a **workspace**, not to an agent — the workspace cuts one per repo when it is created
and removes them when it is removed, and every agent in it works there
(`src/main/workspace/workspace-manager.ts:38`, `:69`). This subsystem owns the lifecycle of
those worktrees (create, list, remove), branch/PR checkout, the durable per-worktree *meta*
sidecar that makes sessions rediscoverable, the "managed worktree" guards that keep agent
scratch files out of the index, and thin wrappers over `git`/`gh` for diffing, committing, and
opening PRs. It is called from `src/main/workspace` (create/remove) and `src/main/session`
(checkout, meta, commit); this code never touches the session map.

## Covered code

- `src/main/git/git-exec.ts` — `gitExec(args, cwd)`: spawns `git` with explicit stdio, resolves stdout, rejects on non-zero exit. The single low-level primitive most files build on.
- `src/main/git/worktree-manager.ts` — `WorktreeManager`: create / list / remove Manifold-managed worktrees; `createWorktree` (new branch), `createWorktreeFromBranch`, `branchExists`, `ensureBaseRef`.
- `src/main/git/branch-checkout-manager.ts` — `BranchCheckoutManager`: list local/remote branches, list/fetch open PRs via `gh`, and `createWorktreeFromBranch` for an existing branch.
- `src/main/git/worktree-meta.ts` — `readWorktreeMeta` / `writeWorktreeMeta` / `removeWorktreeMeta` and the `WorktreeMeta` shape: the durable per-session record stored as a sidecar file.
- `src/main/git/managed-worktree.ts` — `prepareManagedWorktree`, `commitManagedWorktree`, `commitManagedWorktreeIndex`, `getManagedWorktreeStatus`, `stageManagedWorktreePath(s)`, `unstageManagedWorktreePaths`, `discardManagedWorktreePaths`, plus poisoned-index detection/repair.
- `src/main/git/porcelain-status.ts` — `parseWorkspaceStatus`: splits `git status --porcelain` into `staged` / `unstaged` by reading the index and worktree columns separately, for the Source Control panel's staging UI.
- `src/main/git/git-operations.ts` — `GitOperationsManager`: commit, fetch-and-fast-forward base, ahead/behind, merged check, conflict listing/resolution, PR context, and `aiGenerate` (runs an AI runtime for commit/PR text).
- `src/main/git/pr-creator.ts` — `PrCreator`: push the branch and open a PR through `gh pr create`.
- `src/main/git/pr-status.ts` — `viewPullRequestStatus()`: URL-based `gh pr view --json state,mergedAt` lookup used when cached verdict PR state is verified later.
- `src/main/git/diff-provider.ts` — `DiffProvider`: diff/changed-files/numstat against the base branch (including untracked files) without mutating the index.
- `src/main/git/branch-namer.ts` — `generateBranchName` / `slugify`: derive a unique `<repo>/<slug>` branch name from a task description.
- `src/main/git/git-errors.ts` — `isGitRepositoryError` / `isMissingGitError`: error classifiers used by discovery and the file watcher.

## How it works

**Raw exec.** `gitExec()` (`git-exec.ts:8`) is a thin `spawn('git', …)` wrapper with
`stdio: ['ignore', 'pipe', 'pipe']` — explicit stdio avoids Electron `EBADF` issues from a
non-TTY context. It throws `git <subcommand> failed (code N): <stderr>` on failure.
Several call sites use Node's `execFile` directly instead (`git-operations.ts`,
`pr-creator.ts`, and the untracked-file path in `diff-provider.ts`) when they need a larger
`maxBuffer` or to capture exit-code details.

**Create a worktree.** `WorktreeManager.createWorktree()` (`worktree-manager.ts:22`) picks a
branch name (caller-supplied or `generateBranchName`), makes the per-project worktree base
`<storage>/worktrees/<projectName>/`, sanitizes the branch into a directory name
(`/` → `-`), calls `ensureBaseRef` (which bootstraps an empty repo with an
`--allow-empty` initial commit), then `git worktree add -b <branch> <path> <base>`. It
immediately runs `git reset --mixed HEAD` so stale index/admin state can't leak across
sessions, then `prepareManagedWorktree`. If any post-`add` step throws, it rolls the `add`
back (remove the worktree, `git branch -D` the new branch) so no orphan branch+dir leaks —
the meta sidecar isn't written until `session-creator` runs, so without rollback the orphan
would be invisible to `listWorktrees`. `createWorktreeFromBranch` (`worktree-manager.ts:73`)
is the no-`-b` variant for an existing branch: it reuses the path if it exists, prunes, and
switches the main repo off the branch first if that branch is currently checked out there
(git refuses a worktree for an already-checked-out branch). All mutating sequences run under a
per-repo lock (`repo-lock.ts`) so concurrent spawns/checkouts on the same repo can't race git's
own index/worktree locks.

**List worktrees.** `listWorktrees()` (`worktree-manager.ts:200`) parses
`git worktree list --porcelain`, skips the main repo path, and — critically — keeps only
worktrees that have a meta sidecar (`readWorktreeMeta` non-null). That filter is what makes
"Manifold-managed" worktrees distinct from any the user created by hand.

**Remove a worktree.** `removeWorktree()` (`worktree-manager.ts:150`, under the per-repo lock)
tries `git worktree remove --force`, then `--force --force` (locked worktrees), and finally
falls back to `fs.rm` + `git worktree prune`. The meta sidecar is removed *last* — only after
the worktree is actually gone (a successful `remove` or a successful `fs.rm`). Removing it
up-front would orphan the worktree if *every* removal path failed: it would stay on disk and in
`git worktree list` yet be invisible to Manifold forever. Keeping the meta until removal
succeeds makes that failure recoverable, and the worktree being gone is what stops
`SessionDiscovery` resurrecting a deleted agent from the sidecar's presence.

**Worktree meta.** The `WorktreeMeta` record (`worktree-meta.ts:3`) holds `runtimeId`,
`displayName`, `taskDescription`, simple-mode template fields, `additionalDirs`,
`ollamaModel`, workspace fields, `nonInteractive`, and `locked` (the deletion-protection
flag). It is stored *next to* the worktree
directory as `<worktreePath>.manifold.json` (`metaPath`, `worktree-meta.ts:18`), not inside
it, so it survives `git worktree remove` and isn't picked up by git. Reads swallow errors and
return `null` (`worktree-meta.ts:29`). This sidecar is the source of truth that lets the
session layer rebuild dormant sessions on the next launch.

**Managed-worktree guards.** Before any staging/commit, `ensureManagedWorktreeGuards`
(`managed-worktree.ts:23`) appends a fenced block of agent-scratch excludes
(`/.claude/`, `/.cursor/`, `/.opencode/`, …) to the worktree's `info/exclude`, so a bulk
`git add -A` can't poison the real index with transient AI files. **The path git hands back is
anchored to the worktree before it is opened** (`resolve(worktreePath, gitPath)`,
`managed-worktree.ts:31`): `rev-parse --git-path` answers with an absolute path for a *linked*
worktree but a relative `.git/info/exclude` for an ordinary repo — which a home workspace is —
and `readFile`/`writeFile` would resolve that against `process.cwd()`, writing the guards into
whichever repo the app happened to be launched from. `managed-worktree.exclude-path.test.ts`
pins it against a real repo; the older mocked suite never could, since it always stubs the
absolute answer, the one case that cannot go wrong. `commitManagedWorktree`
(`managed-worktree.ts:66`) stages everything (`add -A`) then commits with the given message
(or `--no-edit` when the message is empty). All staging/status/commit calls run inside
`runWithPoisonedIndexRecovery` (`managed-worktree.ts:92`): if git reports an unreadable-object
/ "Error building trees" failure (`isPoisonedIndexError`, `managed-worktree.ts:83`), it
renames the index aside, runs `reset --mixed HEAD`, re-applies the guards, and retries once.

**Branch & PR checkout.** `BranchCheckoutManager.listBranches()`
(`branch-checkout-manager.ts:53`) best-effort `fetch --all --prune`, lists local + remote refs
via `git branch -a`, drops branches checked out in another worktree while retaining the branch
of the checkout that opened the picker, and tags each result
`local` / `remote` / `both`, retaining the remote name so the renderer can display
`origin/<branch>` separately from its local branch. `listOpenPRs` and `fetchPRBranch` shell out to `gh`
(`ghExec`, `branch-checkout-manager.ts:12`) — `parsePRNumber` accepts a bare number or a
`/pull/<n>` URL. Its own `createWorktreeFromBranch` (`branch-checkout-manager.ts:160`)
mirrors `WorktreeManager`'s existing-branch path and is what `SessionCreator` calls for
`existingBranch` / PR-checkout spawns. Both of its paths best-effort fast-forward the branch
from origin before handing the worktree to a session — a reused worktree runs
`pull --ff-only origin <branch>` (`branch-checkout-manager.ts:180`), a fresh checkout of an
existing local branch runs a forceless `fetch origin <branch>:<branch>`
(`branch-checkout-manager.ts:210`) — because the picker's `fetch --all --prune` only moves
`origin/<branch>`, never `refs/heads/<branch>`, which used to spawn agents on stale tips.
Diverged or local-only work is never rewritten (no `+` refspec / `--ff-only`), and a
remote-only branch skips the fetch so `worktree add`'s DWIM keeps upstream tracking. Pinned by
real-git tests in `branch-checkout-manager.freshness.test.ts`.

**Diffs and PRs.** `DiffProvider` (`diff-provider.ts:10`) computes the diff, changed-file
list, and numstat against `baseBranch` by comparing the working tree directly to the base ref
(no index mutation), and appends untracked files via `ls-files --others` + `diff --no-index`.
`getChangedFiles` also tags provenance: it cross-checks the two-dot file list against this
worktree's *own* changes (`getOwnChangedPaths` — committed since the merge-base `<base>...HEAD`
plus uncommitted `git diff HEAD`) and sets `FileChange.foreignWorktree` on files that differ
only because the base branch advanced — i.e. were changed in another worktree (`diff-provider.ts:69`).
`GitOperationsManager` (`git-operations.ts:24`) commits (delegating to
`commitManagedWorktree`), fast-forwards the base branch (`fetchAndUpdate`,
`git-operations.ts:57` — `merge --ff-only` in whichever worktree has the base
checked out, if any, else `fetch origin base:base`; git refuses `fetch base:base`
for a ref checked out in *any* worktree, not just the project's own working tree),
computes `getAheadBehind`, checks merge state, lists/resolves
conflicts, and gathers `getPRContext` (log/diffstat/truncated patch) used to seed AI-generated
PR text. `PrCreator.createPR()` (`pr-creator.ts:22`) verifies `gh` is installed, pushes with
`-u origin <branch>`, runs `gh pr create --title/--body/--base/--head`, and returns the parsed
PR URL. Later PR-state refreshes do not depend on branch names: `viewPullRequestStatus()`
accepts the stored PR URL and parses `gh pr view <url> --json state,mergedAt`, treating any
`mergedAt` timestamp as `merged` (`pr-status.ts:12`, `:28`).

## Key types and entry points

- `WorktreeManager` — `worktree-manager.ts:15`. `createWorktree`, `createWorktreeFromBranch`, `removeWorktree`, `listWorktrees`, `branchExists`, `deleteBranch`. Constructed with the user's `storagePath`.
- `BranchCheckoutManager` — `branch-checkout-manager.ts:50`. `listBranches`, `listOpenPRs`, `fetchPRBranch`, `createWorktreeFromBranch`.
- `WorktreeMeta` / `readWorktreeMeta` / `writeWorktreeMeta` / `removeWorktreeMeta` — `worktree-meta.ts:3`. The durable per-session sidecar.
- `commitManagedWorktree` / `prepareManagedWorktree` / `getManagedWorktreeStatus` — `managed-worktree.ts:66` / `:19` / `:49`.
- `GitOperationsManager` — `git-operations.ts:24`. `commit`, `fetchAndUpdate`, `getAheadBehind`, `getRemoteBehindCount` (read-only probe: `fetch origin <base>` then `rev-list --count <base>..FETCH_HEAD`, never moves the local branch; `git-operations.ts:110`), `isBranchMerged`, `getConflicts`, `resolveConflict`, `getPRContext`, `aiGenerate`.
- `PrCreator` — `pr-creator.ts:6`. `isGhAvailable`, `pushBranch`, `createPR`.
- `viewPullRequestStatus` — `pr-status.ts:12`. Checks one stored PR URL and returns normalized `open`/`closed`/`merged`/`unknown` state plus `mergedAt`.
- `DiffProvider` — `diff-provider.ts:10`. `getDiff`, `getDiffStats`, `getChangedFiles`, `getOriginalContent`.
- `generateBranchName` — `branch-namer.ts:24`. `<repo>/<slug>`, deduplicated with a numeric suffix.
- `gitExec` — `git-exec.ts:8`. The shared low-level git runner; takes an optional `timeoutMs` that `SIGKILL`s the child.
- `withRepoLock` — `repo-lock.ts`. Per-repo promise queue that serializes mutating git operations on the same repo path.

## Interactions

- **Workspace** (`src/main/workspace`): owns worktree *lifetime*. `WorkspaceManager.create` / `addProject` call `createWorktree` through `buildWorkspaceWorkingSet`, and `remove` / `removeProject` call `removeWorktree` through `removeWorkspaceWorktrees` (`workspace-worktrees.ts:48`, `:81`).
- **Session** (`src/main/session`): the other consumer, but no longer a creator or remover on the ordinary path. `SessionCreator` reads meta and checks out branches, and still calls `createWorktree` / `createWorktreeFromBranch` for direct IPC/plugin callers; `SessionDiscovery` rebuilds dormant sessions from `WorktreeManager.listWorktrees` + `readWorktreeMeta`; teardown uses `commitManagedWorktree` and base checkout. `SessionKiller` calls neither `removeWorktree` nor `deleteBranch` (`session-killer.ts:28`).
- **Wiring** (`src/main/app/index.ts:55`): the singletons are constructed at startup — `WorktreeManager`/`BranchCheckoutManager` get `settingsStore.getSettings().storagePath`; `DiffProvider`, `PrCreator`, `GitOperationsManager` are parameterless — and threaded into the IPC dependency bag.
- **IPC** (`src/main/ipc/git-handlers.ts`): `diff:get`/`diff:file-original` → `DiffProvider`; `pr:create` → `PrCreator.createPR` (then `verdictRecorder.onPrCreated`, `git-handlers.ts:59`); `git:commit`/`git:ai-generate`/`git:ahead-behind`/`git:resolve-conflict`/`git:pr-context`/`git:fetch`/`git:staleness` → `GitOperationsManager`; `git:workspace-status` reads each workspace checkout's branch (`gitExec` rev-parse) and porcelain status for the renderer's Source Control panel, parsing it with `parseWorkspaceStatus` (`git/porcelain-status.ts:33`) rather than the file watcher's `parseStatusWithConflicts` — the panel's staging UI needs porcelain's index (`X`) and worktree (`Y`) columns apart, so the handler returns `staged` and `unstaged` groups in which a staged-then-edited file legitimately appears twice, and conflicts appear only under `unstaged`. The panel's row and group actions land on `git:workspace-stage` / `-unstage` / `-discard` (→ `stageManagedWorktreePaths` / `unstageManagedWorktreePaths` / `discardManagedWorktreePaths`, `managed-worktree.ts:56`, `:74`, `:88`), each taking a path array so a whole group is one git invocation, and all keeping the managed-worktree guards + poisoned-index recovery. Discard is `git restore --worktree` for tracked paths and `git clean -fd` for untracked ones, split by an `ls-files -z` probe. `git:workspace-commit` takes a `stageAll` flag: set (the panel's answer to its "nothing is staged, stage everything?" prompt) it runs the same stage-all `gitOps.commit` as the session-scoped path, clear it runs `commitManagedWorktreeIndex` (`managed-worktree.ts:117`), which commits the index *without* the `add -A` and so leaves deliberately-unstaged work behind. `git:workspace-checkout` is a `withRepoLock`-serialized `git checkout [-b]` in the checkout path. `git:workspace-pull` is the status-bar sync: under the same repo lock it runs `pull --ff-only` and then `push`, returning a typed result with the failed command, reason, and accumulated command output instead of discarding a rejected command's context (`git-handlers.ts:267`). Clicking a changed file fetches `git:workspace-file-diff`, whose `staged` flag picks the base: a staged row is `git diff --cached` + `git show HEAD:<file>`, an unstaged row `git diff` + `git show :<file>` (the index), so each half of a staged-then-edited file diffs against the right side — VS Code's SCM-click behavior. Branch/PR listing rides `agent-handlers.ts` (`branch:list`, `pr:list-open`, `pr:fetch-branch` → `branchCheckout.*`, `agent-handlers.ts:324`). All handlers short-circuit to empty results / throw for non-git (folder) projects via `isGitProject`.
- **File watcher** (`src/main/fs/file-watcher.ts:131`): uses `isMissingGitError` to disable git polling when the `git` binary is absent.
- **Agent runtimes** (`src/main/agent`): `GitOperationsManager.aiGenerate` builds its command with `buildAiRuntimeCommand` and parses output via `parseAiRuntimeOutput` / `parseAiRuntimeFailure`.

## Invariants & gotchas

- **Meta sidecar lives outside the worktree.** It is `<worktreePath>.manifold.json`, a *sibling* of the directory (`worktree-meta.ts:18`), so it persists across `git worktree remove` and is invisible to git. Discovery keys off its presence; `removeWorktree` deletes it *last* — only once the worktree is actually gone — so a removal that fails outright keeps the orphan visible-and-removable rather than invisible forever (`worktree-manager.ts:150`).
- **Mutating git ops are serialized per repo.** `withRepoLock(projectPath, …)` (`repo-lock.ts`) chains create/remove/checkout/fetch on a given repo so concurrent spawns can't collide on git's index/worktree locks or both pass a branch-existence check (`worktree-manager.ts`, `branch-checkout-manager.ts`).
- **A worktree is "managed" only if it has meta.** `listWorktrees` filters out any worktree (and the main repo) without a sidecar (`worktree-manager.ts:227`), so hand-rolled worktrees are ignored.
- **Removal degrades gracefully.** `--force` → `--force --force` → `fs.rm` + `prune`; every failure is logged via `debugLog` but never thrown, so teardown can't get wedged on a locked worktree (`worktree-manager.ts:150`).
- **Network commands have a kill timeout.** `gitExec`/`ghExec` take a timeout that `SIGKILL`s the child and rejects, applied to `fetch`/`gh pr` so a hung child (e.g. git prompting on `/dev/tty`) can't wedge an IPC handler (`git-exec.ts`, `branch-checkout-manager.ts`).
- **`aiGenerate` model children are killable.** Each run can take an `AbortSignal`; aborting (or hitting the timeout) kills the child SIGTERM→SIGKILL after `AI_GENERATE_KILL_GRACE_MS`. Live children are tracked in a module-level set so `killInFlightAiGenerateChildren()` — called from `before-quit` (`app-lifecycle.ts:88`) — reaps any in-flight model CLIs on quit instead of orphaning them (`git-operations.ts`).
- **Fresh worktrees are reset.** Both create paths run `git reset --mixed HEAD` right after `worktree add` to drop stale index/admin state that could otherwise leak between sessions (`worktree-manager.ts:45`, `branch-checkout-manager.ts:217`).
- **Existing-branch checkouts are freshened, never rewritten.** `BranchCheckoutManager.createWorktreeFromBranch` fast-forwards the branch from origin before a session starts (`pull --ff-only` in a reused worktree, forceless `fetch <branch>:<branch>` otherwise); divergence, local-only commits, or being offline all fall through to the local state (`branch-checkout-manager.ts:174`, `:198`).
- **Index poisoning self-heals.** Staging/commit/status retry once after renaming a corrupt index aside and re-running `reset --mixed HEAD` (`managed-worktree.ts:106`); the bad index is kept as `index.manifold-bad-<ts>` rather than deleted.
- **Empty repos are bootstrapped.** `ensureBaseRef` creates an `--allow-empty` "Initial commit" so a brand-new repo with no refs can still host a worktree (`worktree-manager.ts:107`).
- **Diffs never mutate the index.** `DiffProvider` compares the working tree to the base ref directly and tolerates a branch with no commits yet (each git call is wrapped in try/catch returning empty) (`diff-provider.ts:29`).
- **Foreign-worktree provenance fails closed.** When the base branch has advanced, a two-dot `git diff <base>` surfaces files changed in *other* worktrees. `getChangedFiles` flags those via `foreignWorktree`, but only when `getOwnChangedPaths` succeeds; if the merge-base diff (`<base>...HEAD`) throws (e.g. no commits yet) it returns `null` and *nothing* is flagged, so inherited files are never mis-marked as the worktree's own and vice-versa (`diff-provider.ts:103`).
- **`gh` is required for PR/branch features.** `PrCreator.createPR` throws a friendly "GitHub CLI not installed/authenticated" error if `gh --version` fails (`pr-creator.ts:36`); `listOpenPRs`/`fetchPRBranch` will reject if `gh` is missing.
- **`resolveConflict` guards path traversal.** It rejects a resolved path that escapes the worktree before writing, requiring a `path.sep` boundary so a sibling worktree sharing a name prefix is also rejected (`git-operations.ts:114`).
