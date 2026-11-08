---
description: How Manifold watches worktrees for git/tree changes and reads, writes, lists, and imports files for the renderer's editor and file tree.
covers: [src/main/fs]
updated: 2026-11-08
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
- `src/main/fs/checkout-status-cache.ts` — raw porcelain and branch cache shared with workspace status, its freshness limit, and path-based mutation invalidation.
- `src/main/fs/file-watcher-utils.ts` — `runGit()` (the hardened spawn: continuously drained stderr with an 8192-character diagnostic prefix, 10 s kill-on-timeout) behind `gitStatus()` (`git status --porcelain`) and `gitCurrentBranch()` (`git rev-parse --abbrev-ref HEAD`), plus `parseStatusWithConflicts()`, the async `buildChangeFingerprint()`, the `EXCLUDED_DIRS` set, and the `isVisibleEntry`/`directoriesFirstComparator` tree filters.
- `src/main/fs/tree-watcher.ts` — `ChokidarTreeWatcher` (debounced add/change/unlink/addDir/unlinkDir → `files:tree-changed`), the `TreeWatcher` interface, and `NoopTreeWatcher` (the test default).
- `src/main/fs/file-tree-builder.ts` — `buildFileTree()`: a recursive, **asynchronous** `FileTreeNode` walk with hidden/excluded entries filtered.
- `src/main/fs/list-files.ts` — `listWorktreeFiles()`: `git ls-files --cached --others --exclude-standard` for the Quick-Open set, capped at 10000.
- `src/main/fs/verdict-poll-forwarder.ts` — `VerdictPollForwarder`: derives commit/files-changed/PR-URL signals from each git poll and forwards them to the verdict recorder.

Not detailed here: `add-dir-detector.ts` (`detectAddDir`) and `url-detector.ts` (`detectUrl`) are PTY-output text scanners consumed by session streaming, and `verdict-poll-forwarder` only borrows the poll loop — none are file I/O. One trap worth knowing in `detectAddDir`: a TUI places each word at a column (`\x1b[<n>G`, `\x1b[<r>;<c>H`) instead of emitting the spaces between them, so cursor-movement codes must be replaced with a space rather than stripped — strip them and the words fuse ("Addedas a working directory") and no pattern can ever match.

## How it works

`FileWatcher` delegates to `CheckoutStatusPoller`, whose registry keys are `path.resolve()`d
checkout paths (`checkout-status-poller.ts:40`, `:62`, `:74`). Primary and additional-directory
consumers share one 2000 ms timer, in-flight request, status and fingerprint per key
(`checkout-status-poller.ts:115`, `:171`). Successful polls also publish raw porcelain to the
process-wide checkout cache before notifying consumers (`checkout-status-poller.ts:180`).
`git:workspace-status` reuses that text while it is less than one tick old, parsing its own
staged/unstaged/untracked groups; it reuses a nonempty cached branch and always reads upstream
ahead/behind separately (`src/main/ipc/workspace-status.ts:27`). Missing, expired, invalidated
or not-yet-successful entries fall back to a direct status read without registering a producer
or starting a timer (`checkout-status-cache.ts:19`, `:30`, `src/main/ipc/workspace-status.ts:30`).

**Freshness and invalidation.** The raw cache is separate from the producer's retained change
snapshot. Every poll error clears raw freshness, including a non-repo error that leaves the
producer running because a subscriber joined mid-request (`checkout-status-poller.ts:204`).
`invalidateCheckoutStatus` normalizes the changed path, clears matching raw entries and advances
their generations; file paths invalidate containing checkouts, and directory paths also invalidate
nested checkouts (`checkout-status-cache.ts:35`, `:42`). Git and file mutation handlers call this
helper before returning or sending follow-up refresh events (`src/main/ipc/git-workspace-handlers.ts:37`,
`:105`, `:141`; `src/main/ipc/git-handlers.ts:80`, `:103`; `src/main/ipc/file-handlers.ts:113`).
Polls capture the generation before awaiting Git and reject invalidated status, fingerprint and
branch completions (`checkout-status-poller.ts:176`, `:183`, `:199`). Invalidation leaves the
change-detection status and fingerprint intact, so it cannot itself emit `files:changed` or
record a human edit. Final unwatch and unwatchAll remove raw entries as well as timers
(`checkout-status-poller.ts:107`, `:131`).

**Subscribe.** `watch(path, sessionId)` adds a primary subscription; `watchAdditionalDir`
adds an additional-directory subscription. Each set is keyed by session id. Repeating the same
registration is a strict no-op, including no cached replay or immediate Git request. A new
subscriber immediately receives the current cached state, including an empty clean checkout,
without another status request (`checkout-status-poller.ts:62`, `:74`). Equivalent paths share
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
their original `source` and no conflicts (`checkout-status-poller.ts:171`, `file-watcher.ts:27`).
Unchanged polls emit nothing to existing subscribers. Each primary keeps its own initial-notified
and last-branch state, so a new subscriber gets its own initial verdict notification and cached
branch callback (`checkout-status-poller.ts:13`, `:156`).

**Branch reporting.** While primaries exist, the producer reads the branch once every tick,
even on a clean unchanged checkout, and reports it under every primary session id. Detached
HEAD and failed reads clear the replayable branch cache and produce no branch report
(`checkout-status-poller.ts:198`). Removing the last primary clears that cache and invalidates
in-flight branch reads, so a primary joining a previously additional-only producer gets its
first branch report from a fresh read on the next tick (`checkout-status-poller.ts:85`, `:199`).
`SessionManager.applyBranchChange` updates sessions sharing that checkout
(`src/main/session/session-manager-context.ts:155`). Additional-directory consumers never
receive branch or verdict signals.

**Unsubscribe.** `unwatch(path, sessionId)` removes only that primary subscription; omitting
the id removes all primaries of the path, preserving additional-directory consumers.
`unwatchAdditionalDir` normalizes its key identically. Unknown pairs are no-ops; only removal
of the final consumer stops the producer. `unwatchAll` clears every producer and verdict cache
(`checkout-status-poller.ts:85`, `:131`, `file-watcher.ts:99`, `:112`). Async completions check
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
resolution via `git:resolve-conflict` (`useGitOperations.ts:76`, `:71`).

**Tree watching.** Git status and its fingerprint can miss gitignored files and new entries
inside an already-untracked directory. Both primary checkouts and additional directories
therefore share one `ChokidarTreeWatcher` per normalized root, independent of Git polling
(`file-watcher.ts:78`, `:92`). It watches `add`/`change`/`unlink`/`addDir`/`unlinkDir`, debounced
200 ms (`tree-watcher.ts:6`, `:50`), covering tree-shape refreshes and prompt editor rereads.
`FileWatcher` fans `files:tree-changed` out to every current subscriber with `{ sessionId,
rootPath }`; additional subscribers also receive their original `source` string for hooks
that match it exactly (`file-watcher.ts:42`). The watcher stays open until the final primary
or additional subscriber leaves (`file-watcher.ts:85`, `:99`). Plain folders remain tree-watched
even after their non-repository error disables Git polling. Chokidar ignores `EXCLUDED_DIRS`
and does not follow symlinks (`tree-watcher.ts:40`). Watcher errors log the affected root and
diagnostic to `~/.manifold/debug.log`; Git polling cannot guarantee tree freshness after a
watcher failure (`tree-watcher.ts:63`, `src/main/app/debug-log.ts:5`). In tests the watcher
defaults to `NoopTreeWatcher`; production wires the real one in `app/index.ts:77`.
`file-watcher-tree.test.ts:25` verifies real local filesystem notifications for unchanged Git
status and non-Git folders; `file-watcher-shared.test.ts:143` pins shared watcher teardown.

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
`importPaths` (`file-watcher.ts:122`) are thin synchronous `fs` wrappers with descriptive
error messages. `createFile`/`createDir`/`renameFile` refuse to clobber an existing target;
`importPaths` builds a copy plan, rejects intra-batch and on-disk collisions up front, then
`cpSync`s with `errorOnExist: true` (`file-watcher.ts:175`). After an out-of-band mutation
(import, pasted image) the handler passes the destination's open folder root to
`notifyTreeChanged(sessionId, rootPath, source?)` (`file-watcher.ts:73`). Its synthetic event
includes a normalized `rootPath` and preserves any `source`, so sidebar project folders
refresh without waiting for chokidar, including for sessions with no active watcher
(`src/main/ipc/file-handlers.ts:173`, `file-watcher-workspace-tree.test.tsx:89`).
This selects the additional-directory source or the most specific containing workspace root,
including other projects, workspace checkouts and sessions' folders
(`src/main/ipc/file-handlers.ts:175`, `src/main/ipc/file-handlers-cache.test.ts:98`).

**Verdict forwarding.** Changed polls and each new primary's first observation call
`VerdictPollForwarder.notifyGitChange`. Its HEAD baseline is per checkout and session, so every
primary can detect its own commits and first PR observation (`verdict-poll-forwarder.ts:75`,
`:102`). Initial clean snapshots and cached replays establish HEAD/PR baselines without
recording a human edit; `onFilesChanged` runs only when status or fingerprint changes
(`checkout-status-poller.ts:189`, `verdict-poll-forwarder.ts:141`). HEAD changes call `onAgentCommit`, and
HEAD changes or first observations can trigger a `gh pr list` lookup. Git/gh calls retain their
10 s timeouts. Forwarding runs asynchronously and checks that the subscription is still active
after each await; teardown discards late results (`verdict-poll-forwarder.ts:119`, `:146`).
Overlapping notifications are serialized per subscription to preserve HEAD observation order
(`verdict-poll-forwarder.ts:156`). Removing one primary evicts only its observation; the last primary removes the path's cache,
while `unwatchAll` clears everything (`file-watcher.ts:99`, `:112`).

## Key types and entry points

- `FileWatcher` — `file-watcher.ts:12`. Public surface: `watch`, `unwatch`, `unwatchAll`, `watchAdditionalDir`, `unwatchAdditionalDir`, `notifyTreeChanged`, `getFileTree`, `readFile`, `writeFile`, `createFile`, `createDir`, `deleteFile`, `renameFile`, `importPaths`, `setMainWindow`, `setVerdictRecorder`, `setOnBranchChanged`. Constructed once in `app/index.ts:77` with a real `ChokidarTreeWatcher`.
- `gitCurrentBranch()` — `file-watcher-utils.ts:53`. The polled branch read; `'HEAD'` when detached.
- `parseStatusWithConflicts()` — `file-watcher-utils.ts:64`. Porcelain → `{ changes: FileChange[]; conflicts: string[] }`. `FileChange`/`FileChangeType` live in `src/shared/types.ts`.
- `buildChangeFingerprint()` — `file-watcher-utils.ts:91`. Async; the size+mtime hash (via parallel `fsp.stat`) that makes re-edits of a still-dirty file detectable.
- `buildFileTree()` — `file-tree-builder.ts:16`. Async; returns `Promise<FileTreeNode>` (`FileTreeNode` in `src/shared/types.ts`). Every `files:tree*` handler awaits it.
- `listWorktreeFiles()` — `list-files.ts:12`. The capped Quick-Open file list.
- `TreeWatcher` / `ChokidarTreeWatcher` / `NoopTreeWatcher` — `tree-watcher.ts:8`, `:23`, `:88`.

## Interactions

- **IPC** (`src/main/ipc/file-handlers.ts`): the renderer-facing surface. `files:tree`/`files:tree-by-project`/`files:tree-dir` → `getFileTree`; `files:read`/`files:write`/`files:delete`/`files:rename`/`files:create-file`/`files:create-dir`/`files:import` → the matching `FileWatcher` method; `files:list` → `listWorktreeFiles`. Every path is `resolve()`d and checked against the workspace roots — every registered project, workspace checkout and session's worktree/`additionalDirs` — before any fs call (`workspaceRoots`, `file-handlers.ts:28`; `isAllowed`, `:48`; `authorize`, `:55`). `files:search-content` and image paste are registered here; their grep parsing and image helpers live in `file-handler-utils.ts`.
- **Agent handlers** (`src/main/ipc/agent-handlers.ts`): delegate creation/resume watch registration to `SessionManager`. `agent:kill` no longer unwatches directly (that would kill events for sibling sessions on a shared checkout); `agent:delete-app` still unwatches the path explicitly.
- **Session** (`src/main/session`): `SessionKiller.cleanupSession` removes every additional-directory subscription and calls `unwatch(worktreePath, session.id)` (`session-killer.ts:54`). Surviving subscribers already receive events. Closing an unsubscribed dormant session cannot affect a live sibling.
- **Git** (`src/main/git`): the watcher shells out directly; missing-Git and non-repository errors disable the shared producer only if no new subscriber joined during the request; otherwise its existing timer retries (`checkout-status-poller.ts:175`, `:208`). A later subscription revives a disabled producer (`checkout-status-poller.ts:138`). The status adapter retains a bounded stderr diagnostic while continuously draining the stream (`file-watcher-utils.ts:9`).
- **Verdict** (`src/main/session/verdict-recorder.ts`): the sink for `VerdictPollForwarder`.
- **Renderer** (`src/renderer/hooks`): `useFileWatcher` listens for `files:changed`/`files:tree-changed` and refreshes the tree (`useFileWatcher.ts:81`, `:95`); `useGitOperations` listens for `agent:conflicts` (`useGitOperations.ts:76`); `useAdditionalDirs` reacts to `files:tree-changed` for `--add-dir` panels. `useWorkspaceTree` matches tree events by root path or session id, add-dir status events by `source`, and reloads on focus (`useWorkspaceTree.ts:133`, `:138`, `:142`). It batches fan-out and queues one trailing reload during a pending walk; null replies preserve its cache ([workspace trees](workspace-trees.md)). `useWorkspaceRepoStatuses` also consumes `files:changed` (`workspace-git-status.ts:93`): it normalizes `source` or the session worktree path, refreshes only matching workspace repos, ignores known unrelated paths and refreshes all when discovery is incomplete (`workspace-git-events.ts:28`). Requests share one in-flight read per workspace and merge pending project IDs into one trailing refresh (`workspace-git-status.ts:44`, `:56`).

## Invariants & gotchas

- **Polling is the source of truth for git status; chokidar is the low-latency filesystem signal.** `files:changed` (+ conflicts) comes from the 2 s git poll; `files:tree-changed` comes from debounced chokidar add/change/unlink events. A renderer needs both: status without create/delete, create/delete without status, and prompt open-file rereads for content edits that should not wait on git polling.
- **Change detection is status + fingerprint.** A file edited twice with the same porcelain code still re-emits because `buildChangeFingerprint` hashes size+mtime (`file-watcher.test.ts:162`). Conversely, an identical status *and* fingerprint emits nothing.
- **A branch switch is invisible to `git status`.** Checking out another branch on a clean tree leaves the porcelain output unchanged, so the branch read runs on every tick regardless of whether the status moved (`checkout-status-poller.ts:198`). Gating it behind the change guard is how a session ends up labelled with the branch it was spawned on long after the agent cut a new one.
- **Every unmerged porcelain code is a conflict.** Any code containing `U` (plus `AA`/`DD`) populates the conflict list; other codes never do, regardless of how they map to `added`/`deleted`/`modified` (`file-watcher-utils.ts:60`).
- **Symlinked dirs must be filtered explicitly.** A symlink's `Dirent.isDirectory()` is `false`, so `isVisibleEntry`/`tree-watcher` both also check `isSymbolicLink()`; missing this followed a symlinked `node_modules` into the full tree and froze the UI (`file-tree-builder.test.ts:18`).
- **The fs operations are synchronous; the tree walk and the poll's change fingerprint are not.** The file ops (read/write/create/rename/delete/import) are single syscalls and stay sync, but anything that touches *many* paths reads async: `buildFileTree` (`fsp.readdir`) and `buildChangeFingerprint` (`fsp.stat`). Both were the same bug — a walk over thousands of entries holding the main thread — and `EXCLUDED_DIRS` plus the symlink guard bound the work but do not make it non-blocking. There is no tree cache: a switch back to a folder walks it again (cheap now that it yields, but still work). `EXCLUDED_DIRS` is hard-coded (`file-watcher-utils.ts:114`) — there is no per-project ignore config; only `.gitignore` (via `ls-files --exclude-standard`) and that fixed set apply.
- **Mutating ops never trust the watcher to refresh.** Handlers return the freshly built tree and/or call `notifyTreeChanged` so the editor updates immediately instead of waiting up to 2 s / 200 ms (`file-handlers.ts:128`, `:188`).
- **Git polling self-disables unless a new subscriber joined during the failed request.** Missing Git or a non-repository diagnostic clears the interval after one failure if the subscription generation is unchanged; duplicate registrations do not advance it (`checkout-status-poller.ts:208`, `:62`, `:74`). A primary or additional-directory subscriber joining the pending request keeps the existing interval for a retry on the next tick, without creating another timer (`checkout-status-poller.ts:69`, `:80`, `:175`; `checkout-status-poller.test.ts:39`). A subscriber joining an already disabled producer restarts the timer and polls immediately, clearing stale status, fingerprint, branch and per-primary first-observation state (`checkout-status-poller.ts:138`). Existing subscribers stay attached, so a recreated checkout recovers for everyone (`file-watcher-lifecycle.test.ts:165`). Other errors retry on the next tick.
- **Path safety is enforced in IPC, not here.** `FileWatcher` methods operate on whatever absolute path they're given; the traversal check lives entirely in `file-handlers.ts`. Calling these methods from elsewhere bypasses that guard.
- **The guard is scoped to the open folders, not to the selected session.** Any registered repo, any workspace's checkout of one, and any session worktree is readable and writable whichever agent is selected, and reads *and creates* work with no session at all (`file-handlers.ts:157`, `:165`) — the sidebar shows several folders' files at once and opens any of them. What the guard still refuses is a path under none of those roots.
