---
description: How Manifold watches worktrees for git/tree changes and reads, writes, lists, and imports files for the renderer's editor and file tree.
covers: [src/main/fs]
updated: 2026-08-08
owner: see .github/CODEOWNERS
---

# Filesystem — watching worktrees and serving the editor

This subsystem is the main process's only file-aware service. A single `FileWatcher`
instance polls each watched worktree's `git status`, pushes change/conflict events to the
renderer, runs a chokidar tree-watcher for create/delete events, and exposes the
synchronous file operations (read/write/create/rename/delete/import) that back the
renderer's editor and file tree. Path validation and the IPC surface live one layer up in
`src/main/ipc/file-handlers.ts`; this code does the work.

## Covered code

- `src/main/fs/file-watcher.ts` — `FileWatcher`, the façade: owns the per-path poll map, the git-status polling loop, the tree-watcher, the verdict forwarder, and every fs operation method.
- `src/main/fs/file-watcher-utils.ts` — `runGit()` (the hardened spawn: `stderr: 'ignore'`, 10 s kill-on-timeout) behind `gitStatus()` (`git status --porcelain`) and `gitCurrentBranch()` (`git rev-parse --abbrev-ref HEAD`), plus `parseStatusWithConflicts()`, the async `buildChangeFingerprint()`, the `EXCLUDED_DIRS` set, and the `isVisibleEntry`/`directoriesFirstComparator` tree filters.
- `src/main/fs/tree-watcher.ts` — `ChokidarTreeWatcher` (debounced add/change/unlink/addDir/unlinkDir → `files:tree-changed`), the `TreeWatcher` interface, and `NoopTreeWatcher` (the test default).
- `src/main/fs/file-tree-builder.ts` — `buildFileTree()`: a recursive, synchronous `FileTreeNode` walk with hidden/excluded entries filtered.
- `src/main/fs/list-files.ts` — `listWorktreeFiles()`: `git ls-files --cached --others --exclude-standard` for the Quick-Open set, capped at 10000.
- `src/main/fs/verdict-poll-forwarder.ts` — `VerdictPollForwarder`: derives commit/files-changed/PR-URL signals from each git poll and forwards them to the verdict recorder.

Not detailed here: `add-dir-detector.ts` (`detectAddDir`) and `url-detector.ts` (`detectUrl`) are PTY-output text scanners consumed by session streaming, and `verdict-poll-forwarder` only borrows the poll loop — none are file I/O.

## How it works

`FileWatcher` keeps a `Map<string, PollEntry>` of watched paths (`file-watcher.ts:30`). Each
entry has a `setInterval` timer firing every `POLL_INTERVAL_MS` (2000 ms, `file-watcher.ts:16`),
a `polling` re-entrancy guard, and the last-seen status/fingerprint.

**Watch.** `watch(worktreePath, sessionId)` is idempotent per path (`file-watcher.ts:88`):
it installs the timer, starts the chokidar tree-watcher, and runs one immediate poll. When
the path is *already* watched it re-points the entry's (and the tree-watcher entry's)
`sessionId` to the new session instead of early-returning, so a reused worktree
(`createWorktreeFromBranch`) emits events under the live session id rather than the first one
that watched it (`file-watcher.ts:88`, `tree-watcher.ts:28`). The IPC layer calls `watch` on
`agent:spawn` and `agent:resume` (`agent-handlers.ts:140`, `:272`). Teardown unwatch is owned
by `SessionKiller.cleanupSession` (see below) plus `unwatchAll` on app shutdown
(`app-lifecycle.ts:93`); `agent:delete-app` also unwatches the path explicitly. `watchAdditionalDir` (`file-watcher.ts:63`) does the same for `--add-dir` paths
under an `additional:<sessionId>:<dir>` key.

**Poll → push.** `poll()` (`file-watcher.ts:105`) calls `gitStatusFn` (default
`gitStatus`, spawning `git status --porcelain`), then `parseStatusWithConflicts()` splits the
porcelain output into `FileChange[]` and a conflict list. It only emits when something
*actually* changed — guarded by both the raw status string **and** an (awaited)
`buildChangeFingerprint` of each changed path's `size`+`mtimeMs` (`file-watcher.ts:115`). The
fingerprint stats every changed path off the main thread via `fsp.stat` in parallel
(`file-watcher-utils.ts:44`) so a large dirty tree doesn't stall the 2 s tick. It catches the
case where a dirty file is edited again but its porcelain code is unchanged
(`file-watcher.test.ts:122`). On change it sends `files:changed` (path list) and
`agent:conflicts` (conflict list) to the renderer, then calls the verdict forwarder.

**Branch reporting.** The same tick also reads the checkout's branch via `gitBranchFn`
(default `gitCurrentBranch`) and calls `setOnBranchChanged`'s listener whenever it differs
from the last one seen (`file-watcher.ts:162`, `:59`). This is deliberately *outside* the
changed-status guard: switching branches on a clean tree leaves `git status --porcelain`
byte-identical, so a status-gated read would never fire. A detached HEAD reports `HEAD` and is
skipped, and a failed read degrades to no report rather than losing the tick's `files:changed`.
`SessionManager` is the one listener (`session-manager.ts:138`): it moves the session's
`branchName` onto the branch its checkout actually holds and emits `agent:sessions-changed`,
which is what keeps the status bar and "Create PR" on the branch an agent cut mid-session
rather than the one it was spawned on (`file-watcher-branch.test.ts:43`).

**Conflict handling.** "Conflict" here means a git merge conflict, not an editor-buffer-vs-disk
race. `parseStatusWithConflicts` (`file-watcher-utils.ts:23`) flags every unmerged porcelain
code as a conflict — any code containing `U` (`UU`/`AU`/`UA`/`DU`/`UD`, covering "deleted/added
by us/them") plus the both-added/both-deleted pairs `AA`/`DD`; ordinary ` M`/`A`/`??` lines
produce changes but an empty conflict list (`file-watcher-conflicts.test.ts:88`). Rename/copy
entries (`R`/`C`) render as `old -> new`; the parser keeps the destination path so the
fingerprint stats a real file (`file-watcher-utils.ts:26`). The conflict array always rides alongside
`files:changed` on the same poll tick (`file-watcher-conflicts.test.ts:106`). The renderer's
`useGitOperations` subscribes to `agent:conflicts` and surfaces the files for in-app
resolution via `git:resolve-conflict` (`useGitOperations.ts:68`, `:61`).

**Tree watching.** Polling only sees git-tracked deltas, so a separate `ChokidarTreeWatcher`
(`tree-watcher.ts:20`) watches the same root for `add`/`change`/`unlink`/`addDir`/`unlinkDir`,
debounced 200 ms (`tree-watcher.ts:5`, `:53`). That emits `files:tree-changed`, which covers
both tree-shape refreshes and near-immediate editor rereads after file-content edits. The event
names **the folder that changed as well as the agent working in it** (`{ sessionId, rootPath }`,
`tree-watcher.ts:13`, `file-watcher.ts:55`): the renderer shows several folders at once and
reloads them by path, so a session id alone could not say which listing had gone stale
(`file-watcher.test.ts:319`). It
ignores anything under `EXCLUDED_DIRS` and does not follow symlinks (`tree-watcher.ts:37`).
Watcher errors are swallowed because the poll loop still provides updates (`tree-watcher.ts:60`). In tests the
watcher defaults to `NoopTreeWatcher`; production wires the real one in `app/index.ts:58`.

**Reading the tree.** `getFileTree()` delegates to `buildFileTree()` (`file-tree-builder.ts:7`),
a synchronous recursive walk that filters via `isVisibleEntry` and sorts directories-first.
`isVisibleEntry` checks `isSymbolicLink()` as well as `isDirectory()` so a symlinked
`node_modules` (common in worktrees) is excluded instead of being followed into the whole
dependency tree (`file-watcher-utils.ts:69`, regression test `file-tree-builder.test.ts:22`).
`listWorktreeFiles()` (`list-files.ts:12`) is the flat Quick-Open variant via `git ls-files`,
returning `[]` on any failure and warning (not silently truncating) when it caps at 10000.

**File operations.** `readFile`/`writeFile`/`createFile`/`createDir`/`deleteFile`/`renameFile`/
`importPaths` (`file-watcher.ts:192`–`281`) are thin synchronous `fs` wrappers with descriptive
error messages. `createFile`/`createDir`/`renameFile` refuse to clobber an existing target;
`importPaths` builds a copy plan, rejects intra-batch and on-disk collisions up front, then
`cpSync`s with `errorOnExist: true` (`file-watcher.ts:245`). After an out-of-band mutation
(import, pasted image) the handler calls `notifyTreeChanged()` (`file-watcher.ts:59`) to push
a synthetic `files:tree-changed` so the renderer refreshes without waiting for chokidar.

**Verdict forwarding.** On every *changed* poll, `VerdictPollForwarder.notifyGitChange()`
(`verdict-poll-forwarder.ts:59`) compares the worktree's `HEAD` sha against its last-seen
value: a new commit calls `recorder.onAgentCommit`, every tick calls `onFilesChanged`, and a
HEAD change (or first observation) triggers a one-shot `gh pr list` lookup so a PR created from
the shell is still attached to the verdict (`verdict-poll-forwarder.ts:79`). Every `git`/`gh`
subprocess carries a 10 s timeout so a hung command (e.g. a stalled network `gh pr list`) can't
freeze that worktree's poll tick. `FileWatcher.unwatch` calls `forwarder.evict(path)` to drop
the cached HEAD sha, preventing a leak and a stale-sha-driven spurious `onAgentCommit` if the
path is recreated. It is wired via `fileWatcher.setVerdictRecorder` (`app/index.ts:113`).

## Key types and entry points

- `FileWatcher` — `file-watcher.ts:29`. Public surface: `watch`, `unwatch`, `unwatchAll`, `watchAdditionalDir`, `unwatchAdditionalDir`, `notifyTreeChanged`, `getFileTree`, `readFile`, `writeFile`, `createFile`, `createDir`, `deleteFile`, `renameFile`, `importPaths`, `setMainWindow`, `setVerdictRecorder`, `setOnBranchChanged`. Constructed once in `app/index.ts:58` with a real `ChokidarTreeWatcher`.
- `gitCurrentBranch()` — `file-watcher-utils.ts:49`. The polled branch read; `'HEAD'` when detached.
- `parseStatusWithConflicts()` — `file-watcher-utils.ts:23`. Porcelain → `{ changes: FileChange[]; conflicts: string[] }`. `FileChange`/`FileChangeType` live in `src/shared/types.ts`.
- `buildChangeFingerprint()` — `file-watcher-utils.ts:44`. Async; the size+mtime hash (via parallel `fsp.stat`) that makes re-edits of a still-dirty file detectable.
- `buildFileTree()` — `file-tree-builder.ts:7`. Returns `FileTreeNode` (`src/shared/types.ts`).
- `listWorktreeFiles()` — `list-files.ts:12`. The capped Quick-Open file list.
- `TreeWatcher` / `ChokidarTreeWatcher` / `NoopTreeWatcher` — `tree-watcher.ts:7`, `:20`, `:78`.

## Interactions

- **IPC** (`src/main/ipc/file-handlers.ts`): the renderer-facing surface. `files:tree`/`files:tree-by-project`/`files:tree-dir` → `getFileTree`; `files:read`/`files:write`/`files:delete`/`files:rename`/`files:create-file`/`files:create-dir`/`files:import` → the matching `FileWatcher` method; `files:list` → `listWorktreeFiles`. Every path is `resolve()`d and checked against the workspace roots — every registered project plus every session's worktree and `additionalDirs` — before any fs call (`workspaceRoots`, `file-handlers.ts:26`; `isAllowed`, `:46`; `authorize`, `:53`). `files:search-content` and image paste also live here, not in `src/main/fs`.
- **Agent handlers** (`src/main/ipc/agent-handlers.ts`): start the watch lifecycle — `watch` on spawn/resume. `agent:kill` no longer unwatches directly (that would kill events for sibling sessions on a shared checkout); `agent:delete-app` still unwatches the path explicitly.
- **Session** (`src/main/session`): `SessionKiller.cleanupSession` owns teardown unwatch — it calls `unwatchAdditionalDir` for each `--add-dir` and `unwatch(worktreePath)` once no surviving session shares the path (`worktreeSharedWithOther`, `session-killer.ts:89`). Sharing is now the norm rather than the exception: several agents in one workspace work in the same checkout. This covers the mode-switch teardown paths (`killNonInteractiveSessions`/`killInteractiveSession`), not just the IPC kill. The watcher reads `session.worktreePath`/`additionalDirs` only indirectly through the session/IPC layers.
- **Git** (`src/main/git`): the watcher shells out to `git status`/`ls-files`/`rev-parse`/`gh` directly rather than going through `gitExec`; `isMissingGitError` lets `poll()` permanently disable polling where git can't spawn, and `pollAdditionalDir` additionally disables on `isGitRepositoryError` so a plain non-git `--add-dir` stops respawning a failing `git` every 2 s (`git/git-errors`, `file-watcher.ts:131`, `:157`).
- **Verdict** (`src/main/session/verdict-recorder.ts`): the sink for `VerdictPollForwarder`.
- **Renderer** (`src/renderer/hooks`): `useFileWatcher` listens for `files:changed`/`files:tree-changed` and refreshes the tree (`useFileWatcher.ts:79`, `:93`); `useGitOperations` listens for `agent:conflicts` (`useGitOperations.ts:68`); `useAdditionalDirs` reacts to `files:tree-changed` for `--add-dir` panels; `useWorkspaceTree` reloads one sidebar folder when an event names *its* root — `rootPath` on `files:tree-changed`, `source` on the add-dir `files:changed` — and on window focus, which is the only signal for a folder no agent is working in (`useWorkspaceTree.ts:107`, `:111`, `:116`).

## Invariants & gotchas

- **Polling is the source of truth for git status; chokidar is the low-latency filesystem signal.** `files:changed` (+ conflicts) comes from the 2 s git poll; `files:tree-changed` comes from debounced chokidar add/change/unlink events. A renderer needs both: status without create/delete, create/delete without status, and prompt open-file rereads for content edits that should not wait on git polling.
- **Change detection is status + fingerprint.** A file edited twice with the same porcelain code still re-emits because `buildChangeFingerprint` hashes size+mtime (`file-watcher.test.ts:122`). Conversely, an identical status *and* fingerprint emits nothing.
- **A branch switch is invisible to `git status`.** Checking out another branch on a clean tree leaves the porcelain output unchanged, so the branch read runs on every tick regardless of whether the status moved (`file-watcher.ts:162`). Gating it behind the change guard is how a session ends up labelled with the branch it was spawned on long after the agent cut a new one.
- **Every unmerged porcelain code is a conflict.** Any code containing `U` (plus `AA`/`DD`) populates the conflict list; other codes never do, regardless of how they map to `added`/`deleted`/`modified` (`file-watcher-utils.ts:31`).
- **Symlinked dirs must be filtered explicitly.** A symlink's `Dirent.isDirectory()` is `false`, so `isVisibleEntry`/`tree-watcher` both also check `isSymbolicLink()`; missing this followed a symlinked `node_modules` into the full tree and froze the UI (`file-tree-builder.test.ts:18`).
- **`getFileTree` and the fs operations are synchronous; the poll's change fingerprint is not.** The file ops and tree walk run synchronously on the main thread (the symlink guard and `EXCLUDED_DIRS` keep that walk cheap), but `buildChangeFingerprint` stats async (`fsp.stat`) so a dirty tree of thousands of entries doesn't block the poll tick. `EXCLUDED_DIRS` is hard-coded (`file-watcher-utils.ts:62`) — there is no per-project ignore config; only `.gitignore` (via `ls-files --exclude-standard`) and that fixed set apply.
- **Mutating ops never trust the watcher to refresh.** Handlers return the freshly built tree and/or call `notifyTreeChanged` so the editor updates immediately instead of waiting up to 2 s / 200 ms (`file-handlers.ts:101`, `:160`).
- **Git polling self-disables.** If git can't spawn (`ENOENT`), `disableGitPolling` clears the timer for that entry permanently rather than retrying every 2 s (`file-watcher.ts:164`, `file-watcher.test.ts:203`). For `--add-dir` paths it also disables on "not a git repository" so a plain folder isn't polled forever.
- **Path safety is enforced in IPC, not here.** `FileWatcher` methods operate on whatever absolute path they're given; the traversal check lives entirely in `file-handlers.ts`. Calling these methods from elsewhere bypasses that guard.
- **The guard is scoped to the open folders, not to the selected session.** Any registered repo, any workspace's checkout of one, and any session worktree is readable and writable whichever agent is selected, and reads *and creates* work with no session at all (`file-handlers.ts:156`, `:162`) — the sidebar shows several folders' files at once and opens any of them. What the guard still refuses is a path under none of those roots.
