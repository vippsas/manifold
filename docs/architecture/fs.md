---
description: How Manifold watches worktrees for git/tree changes and reads, writes, lists, and imports files for the renderer's editor and file tree.
covers: [src/main/fs]
updated: 2026-11-01T18:58:24Z
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

- `src/main/fs/file-watcher.ts` — `FileWatcher`, the façade: wires shared checkout polling to renderer events, the tree-watcher, the verdict forwarder, and every fs operation method.
- `src/main/fs/checkout-status-poller.ts` — normalized checkout registry, one producer per checkout, and primary/additional-directory subscribers.
- `src/main/fs/file-watcher-utils.ts` — `runGit()` (the hardened spawn: continuously drained stderr with an 8192-character diagnostic prefix, 10 s kill-on-timeout) behind `gitStatus()` (`git status --porcelain`) and `gitCurrentBranch()` (`git rev-parse --abbrev-ref HEAD`), plus `parseStatusWithConflicts()`, the async `buildChangeFingerprint()`, the `EXCLUDED_DIRS` set, and the `isVisibleEntry`/`directoriesFirstComparator` tree filters.
- `src/main/fs/tree-watcher.ts` — `ChokidarTreeWatcher` (debounced add/change/unlink/addDir/unlinkDir → `files:tree-changed`), the `TreeWatcher` interface, and `NoopTreeWatcher` (the test default).
- `src/main/fs/file-tree-builder.ts` — `buildFileTree()`: a recursive, **asynchronous** `FileTreeNode` walk with hidden/excluded entries filtered.
- `src/main/fs/list-files.ts` — `listWorktreeFiles()`: `git ls-files --cached --others --exclude-standard` for the Quick-Open set, capped at 10000.
- `src/main/fs/verdict-poll-forwarder.ts` — `VerdictPollForwarder`: derives commit/files-changed/PR-URL signals from each git poll and forwards them to the verdict recorder.

Not detailed here: `add-dir-detector.ts` (`detectAddDir`) and `url-detector.ts` (`detectUrl`) are PTY-output text scanners consumed by session streaming, and `verdict-poll-forwarder` only borrows the poll loop — none are file I/O. One trap worth knowing in `detectAddDir`: a TUI places each word at a column (`\x1b[<n>G`, `\x1b[<r>;<c>H`) instead of emitting the spaces between them, so cursor-movement codes must be replaced with a space rather than stripped — strip them and the words fuse ("Addedas a working directory") and no pattern can ever match.

## How it works

`FileWatcher` delegates to `CheckoutStatusPoller`, whose registry keys are `path.resolve()`d
checkout paths (`checkout-status-poller.ts:34`, `:47`, `:57`). Primary and additional-directory
consumers share one 2000 ms timer, in-flight request, cached status and fingerprint per key
(`checkout-status-poller.ts:94`, `:133`). The scope is one `FileWatcher`; the separate
`git:workspace-status` request cache is not shared.

**Subscribe.** `watch(path, sessionId)` adds a primary subscription; `watchAdditionalDir`
adds an additional-directory subscription. Each set is keyed by session id. Repeating the same
registration is a strict no-op, including no cached replay or immediate Git request. A new
subscriber immediately receives the current cached state, including an empty clean checkout,
without another status request (`checkout-status-poller.ts:47`, `:57`). Equivalent paths share
the producer, but an additional-directory subscription retains its original directory string
for `source`, which the renderer matches exactly.

Creation, resume and nonempty chat messages register through `SessionManager.watchCheckout`
(`src/main/session/session-manager.ts:91`, `:116`); dormant discovery registers nothing.
`SessionWorkingSet.record` subscribes newly added directories only for `checkoutWatched`
sessions; dormant sessions retain them in `additionalDirs` for activation
(`src/main/session/session-working-set.ts:100`). Repeated chat turns preserve every sibling's
subscription. `SessionKiller.cleanupSession` removes the departing session's subscriptions,
without handing ownership to a survivor (`src/main/session/session-killer.ts:54`).

**Poll → push.** A tick runs `gitStatusFn` once and computes one async fingerprint over the
parsed changed paths. Status or size/mtime differences fan out `files:changed` to every consumer;
primary consumers also receive `agent:conflicts`, while additional-directory consumers receive
their original `source` and no conflicts (`checkout-status-poller.ts:133`, `file-watcher.ts:27`).
Unchanged polls emit nothing to existing subscribers. Each primary keeps its own initial-notified
and last-branch state, so a new subscriber gets its own initial verdict notification and cached
branch callback (`checkout-status-poller.ts:9`, `:118`).

**Branch reporting.** While primaries exist, the producer reads the branch once every tick,
even on a clean unchanged checkout, and reports it under every primary session id. Detached
HEAD and failed reads clear the replayable branch cache and produce no branch report
(`checkout-status-poller.ts:153`). Removing the last primary clears that cache and invalidates
in-flight branch reads, so a primary joining a previously additional-only producer gets its
first branch report from a fresh read on the next tick (`checkout-status-poller.ts:66`, `:156`).
`SessionManager.applyBranchChange` updates sessions sharing that checkout
(`src/main/session/session-manager-context.ts:150`). Additional-directory consumers never
receive branch or verdict signals.

**Unsubscribe.** `unwatch(path, sessionId)` removes only that primary subscription; omitting
the id removes all primaries of the path, preserving additional-directory consumers.
`unwatchAdditionalDir` normalizes its key identically. Unknown pairs are no-ops; only removal
of the final consumer stops the producer. `unwatchAll` clears every producer and verdict cache
(`checkout-status-poller.ts:66`, `:108`, `file-watcher.ts:89`, `:102`). Async completions check
producer/subscriber identity so removed or replaced subscriptions cannot receive stale events.

**Conflict handling.** "Conflict" here means a git merge conflict, not an editor-buffer-vs-disk
race. `parseStatusWithConflicts` (`file-watcher-utils.ts:64`) flags every unmerged porcelain
code as a conflict — any code containing `U` (`UU`/`AU`/`UA`/`DU`/`UD`, covering "deleted/added
by us/them") plus the both-added/both-deleted pairs `AA`/`DD`; ordinary ` M`/`A`/`??` lines
produce changes but an empty conflict list (`file-watcher-conflicts.test.ts:88`). Rename/copy
entries (`R`/`C`) render as `old -> new`; the parser keeps the destination path so the
fingerprint stats a real file (`file-watcher-utils.ts:76`). The conflict array always rides alongside
`files:changed` on the same poll tick (`file-watcher-conflicts.test.ts:106`). The renderer's
`useGitOperations` subscribes to `agent:conflicts` and surfaces the files for in-app
resolution via `git:resolve-conflict` (`useGitOperations.ts:68`, `:61`).

**Tree watching.** Polling only sees git-tracked deltas, so a separate `ChokidarTreeWatcher`
(`tree-watcher.ts:20`) watches the same root for `add`/`change`/`unlink`/`addDir`/`unlinkDir`,
debounced 200 ms (`tree-watcher.ts:5`, `:53`). That emits `files:tree-changed`, which covers
both tree-shape refreshes and near-immediate editor rereads after file-content edits. The event
names **the folder that changed as well as the agent working in it** (`{ sessionId, rootPath }`,
`tree-watcher.ts:13`, `file-watcher.ts:42`): the renderer shows several folders at once and
reloads them by path, so a session id alone could not say which listing had gone stale
(`file-watcher-shared.test.ts:142`). `FileWatcher` fans tree events out to all current primary
subscribers and closes the tree watcher only when the last primary leaves, even if additional
consumers keep Git polling alive (`file-watcher.ts:82`, `:89`). Chokidar
ignores anything under `EXCLUDED_DIRS` and does not follow symlinks (`tree-watcher.ts:37`).
Watcher errors are swallowed because the poll loop still provides updates (`tree-watcher.ts:60`). In tests the
watcher defaults to `NoopTreeWatcher`; production wires the real one in `app/index.ts:58`.

**Reading the tree.** `getFileTree()` delegates to `buildFileTree()` (`file-tree-builder.ts:16`),
a recursive walk that filters via `isVisibleEntry` and sorts directories-first, reading through
`fs/promises` so it **never blocks the main process's event loop**. It used to walk
synchronously, and every agent/folder switch — plus every debounced tree change, so once per
200ms while an agent edits files — triggers one. Measured in the built app (`drive-app`,
pinging `app:version` during the walk): the synchronous walk held the main process for its
whole duration, 45–97ms on a ~5k-entry checkout and **1.4–2.4s on a ~22k-entry one**, which is
the macOS spinner the user sees. The async walk answers pings throughout (worst 0–46ms) and is
*also* about twice as fast on the large checkout (~0.9s), because the per-directory reads
overlap instead of queueing. The walk now trusts each `Dirent` for its kind and stats only
symlinks, which is both cheaper and what keeps a symlinked source folder browsable
(`file-tree-builder.ts:46`). Its yielding is pinned by a test that arms a timer alongside the
walk and requires it to fire first (`file-tree-builder.test.ts:61`).
`isVisibleEntry` checks `isSymbolicLink()` as well as `isDirectory()` so a symlinked
`node_modules` (common in worktrees) is excluded instead of being followed into the whole
dependency tree (`file-watcher-utils.ts:121`, regression test `file-tree-builder.test.ts:22`).
`listWorktreeFiles()` (`list-files.ts:12`) is the flat Quick-Open variant via `git ls-files`,
returning `[]` on any failure and warning (not silently truncating) when it caps at 10000.

**File operations.** `readFile`/`writeFile`/`createFile`/`createDir`/`deleteFile`/`renameFile`/
`importPaths` (`file-watcher.ts:112`) are thin synchronous `fs` wrappers with descriptive
error messages. `createFile`/`createDir`/`renameFile` refuse to clobber an existing target;
`importPaths` builds a copy plan, rejects intra-batch and on-disk collisions up front, then
`cpSync`s with `errorOnExist: true` (`file-watcher.ts:165`). After an out-of-band mutation
(import, pasted image) the handler calls `notifyTreeChanged()` (`file-watcher.ts:70`) to push
a synthetic `files:tree-changed` so the renderer refreshes without waiting for chokidar.

**Verdict forwarding.** Changed polls and each new primary's first observation call
`VerdictPollForwarder.notifyGitChange`. Its HEAD baseline is per checkout and session, so every
primary can detect its own commits and first PR observation (`verdict-poll-forwarder.ts:75`,
`:102`). Initial clean snapshots and cached replays establish HEAD/PR baselines without
recording a human edit; `onFilesChanged` runs only when status or fingerprint changes
(`checkout-status-poller.ts:143`, `verdict-poll-forwarder.ts:141`). HEAD changes call `onAgentCommit`, and
HEAD changes or first observations can trigger a `gh pr list` lookup. Git/gh calls retain their
10 s timeouts. Forwarding runs asynchronously and checks that the subscription is still active
after each await; teardown discards late results (`verdict-poll-forwarder.ts:119`, `:146`).
Overlapping notifications are serialized per subscription to preserve HEAD observation order
(`verdict-poll-forwarder.ts:156`). Removing one primary evicts only its observation; the last primary removes the path's cache,
while `unwatchAll` clears everything (`file-watcher.ts:89`, `:102`).

## Key types and entry points

- `FileWatcher` — `file-watcher.ts:12`. Public surface: `watch`, `unwatch`, `unwatchAll`, `watchAdditionalDir`, `unwatchAdditionalDir`, `notifyTreeChanged`, `getFileTree`, `readFile`, `writeFile`, `createFile`, `createDir`, `deleteFile`, `renameFile`, `importPaths`, `setMainWindow`, `setVerdictRecorder`, `setOnBranchChanged`. Constructed once in `app/index.ts:58` with a real `ChokidarTreeWatcher`.
- `gitCurrentBranch()` — `file-watcher-utils.ts:53`. The polled branch read; `'HEAD'` when detached.
- `parseStatusWithConflicts()` — `file-watcher-utils.ts:64`. Porcelain → `{ changes: FileChange[]; conflicts: string[] }`. `FileChange`/`FileChangeType` live in `src/shared/types.ts`.
- `buildChangeFingerprint()` — `file-watcher-utils.ts:91`. Async; the size+mtime hash (via parallel `fsp.stat`) that makes re-edits of a still-dirty file detectable.
- `buildFileTree()` — `file-tree-builder.ts:16`. Async; returns `Promise<FileTreeNode>` (`FileTreeNode` in `src/shared/types.ts`). Every `files:tree*` handler awaits it.
- `listWorktreeFiles()` — `list-files.ts:12`. The capped Quick-Open file list.
- `TreeWatcher` / `ChokidarTreeWatcher` / `NoopTreeWatcher` — `tree-watcher.ts:7`, `:20`, `:78`.

## Interactions

- **IPC** (`src/main/ipc/file-handlers.ts`): the renderer-facing surface. `files:tree`/`files:tree-by-project`/`files:tree-dir` → `getFileTree`; `files:read`/`files:write`/`files:delete`/`files:rename`/`files:create-file`/`files:create-dir`/`files:import` → the matching `FileWatcher` method; `files:list` → `listWorktreeFiles`. Every path is `resolve()`d and checked against the workspace roots — every registered project plus every session's worktree and `additionalDirs` — before any fs call (`workspaceRoots`, `file-handlers.ts:26`; `isAllowed`, `:46`; `authorize`, `:53`). `files:search-content` and image paste also live here, not in `src/main/fs`.
- **Agent handlers** (`src/main/ipc/agent-handlers.ts`): delegate creation/resume watch registration to `SessionManager`. `agent:kill` no longer unwatches directly (that would kill events for sibling sessions on a shared checkout); `agent:delete-app` still unwatches the path explicitly.
- **Session** (`src/main/session`): `SessionKiller.cleanupSession` removes every additional-directory subscription and calls `unwatch(worktreePath, session.id)` (`session-killer.ts:54`). Surviving subscribers already receive events. Closing an unsubscribed dormant session cannot affect a live sibling.
- **Git** (`src/main/git`): the watcher shells out directly; missing-Git and non-repository errors disable the shared producer once (`checkout-status-poller.ts:162`). The status adapter retains a bounded stderr diagnostic while continuously draining the stream (`file-watcher-utils.ts:9`).
- **Verdict** (`src/main/session/verdict-recorder.ts`): the sink for `VerdictPollForwarder`.
- **Renderer** (`src/renderer/hooks`): `useFileWatcher` listens for `files:changed`/`files:tree-changed` and refreshes the tree (`useFileWatcher.ts:79`, `:93`); `useGitOperations` listens for `agent:conflicts` (`useGitOperations.ts:68`); `useAdditionalDirs` reacts to `files:tree-changed` for `--add-dir` panels; `useWorkspaceTree` reloads one sidebar folder when an event names *its* root — `rootPath` on `files:tree-changed`, `source` on the add-dir `files:changed` — and on window focus, which is the only signal for a folder no agent is working in (`useWorkspaceTree.ts:107`, `:111`, `:116`).

## Invariants & gotchas

- **Polling is the source of truth for git status; chokidar is the low-latency filesystem signal.** `files:changed` (+ conflicts) comes from the 2 s git poll; `files:tree-changed` comes from debounced chokidar add/change/unlink events. A renderer needs both: status without create/delete, create/delete without status, and prompt open-file rereads for content edits that should not wait on git polling.
- **Change detection is status + fingerprint.** A file edited twice with the same porcelain code still re-emits because `buildChangeFingerprint` hashes size+mtime (`file-watcher.test.ts:166`). Conversely, an identical status *and* fingerprint emits nothing.
- **A branch switch is invisible to `git status`.** Checking out another branch on a clean tree leaves the porcelain output unchanged, so the branch read runs on every tick regardless of whether the status moved (`checkout-status-poller.ts:153`). Gating it behind the change guard is how a session ends up labelled with the branch it was spawned on long after the agent cut a new one.
- **Every unmerged porcelain code is a conflict.** Any code containing `U` (plus `AA`/`DD`) populates the conflict list; other codes never do, regardless of how they map to `added`/`deleted`/`modified` (`file-watcher-utils.ts:58`).
- **Symlinked dirs must be filtered explicitly.** A symlink's `Dirent.isDirectory()` is `false`, so `isVisibleEntry`/`tree-watcher` both also check `isSymbolicLink()`; missing this followed a symlinked `node_modules` into the full tree and froze the UI (`file-tree-builder.test.ts:18`).
- **The fs operations are synchronous; the tree walk and the poll's change fingerprint are not.** The file ops (read/write/create/rename/delete/import) are single syscalls and stay sync, but anything that touches *many* paths reads async: `buildFileTree` (`fsp.readdir`) and `buildChangeFingerprint` (`fsp.stat`). Both were the same bug — a walk over thousands of entries holding the main thread — and `EXCLUDED_DIRS` plus the symlink guard bound the work but do not make it non-blocking. There is no tree cache: a switch back to a folder walks it again (cheap now that it yields, but still work). `EXCLUDED_DIRS` is hard-coded (`file-watcher-utils.ts:113`) — there is no per-project ignore config; only `.gitignore` (via `ls-files --exclude-standard`) and that fixed set apply.
- **Mutating ops never trust the watcher to refresh.** Handlers return the freshly built tree and/or call `notifyTreeChanged` so the editor updates immediately instead of waiting up to 2 s / 200 ms (`file-handlers.ts:101`, `:160`).
- **Git polling self-disables.** Missing Git or a non-repository diagnostic clears the producer's interval permanently while its subscriptions exist (`checkout-status-poller.ts:162`). Other errors retry on the next tick. A new subscriber to a disabled producer does not restart polling (`file-watcher-lifecycle.test.ts:149`).
- **Path safety is enforced in IPC, not here.** `FileWatcher` methods operate on whatever absolute path they're given; the traversal check lives entirely in `file-handlers.ts`. Calling these methods from elsewhere bypasses that guard.
- **The guard is scoped to the open folders, not to the selected session.** Any registered repo, any workspace's checkout of one, and any session worktree is readable and writable whichever agent is selected, and reads *and creates* work with no session at all (`file-handlers.ts:156`, `:162`) — the sidebar shows several folders' files at once and opens any of them. What the guard still refuses is a path under none of those roots.
