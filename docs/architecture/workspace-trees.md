---
description: Cached sidebar folder trees and coalesced reloads for shared checkout events.
covers: [src/renderer/hooks/editor/useWorkspaceTree.ts]
updated: 2026-11-01T19:21:00Z
owner: see .github/CODEOWNERS
---

# Workspace folder trees

`useWorkspaceTree` fetches a sidebar folder through `files:tree-by-project` for a project
or `files:tree` for a session (`src/renderer/hooks/editor/useWorkspaceTree.ts:68`). Its cache
keeps the tree and expanded paths across unmounts, keyed by source kind, id and workspace
(`useWorkspaceTree.ts:12`, `:20`, `:22`). Reloads retain expanded paths and open the root on
the first load (`useWorkspaceTree.ts:75`).

The hook matches `files:tree-changed` by `rootPath` and additional-directory `files:changed`
by the exact `source` string (`useWorkspaceTree.ts:132`, `:136`). Window focus and explicit
refresh use the same reload path (`useWorkspaceTree.ts:56`, `:140`). The main process still
sends tree events for every primary session, preserving consumers that filter by session id
(`src/main/fs/file-watcher.ts:42`, `src/renderer/hooks/editor/useFileWatcher.ts:93`).

For one mounted folder, a zero-delay timer batches a burst of matching events before starting
a walk. While the request is pending, further refreshes set one trailing reload; they cannot
start overlapping walks. The trailing reload runs after completion, including after failure
(`useWorkspaceTree.ts:62`, `:88`, `:97`). Failures preserve the cached tree; changing folders
or unmounting discards old results and cancels scheduled reloads (`useWorkspaceTree.ts:74`,
`:86`, `:109`).

`src/main/fs/file-watcher-workspace-tree.test.tsx` drives the real `FileWatcher` fan-out
with two primaries and fake tree/IPC adapters. It pins one walk per burst, one trailing walk
for changes during a request, failure recovery, root filtering, and teardown cancellation.
These checks run offline; Electron delivery timing and the macOS app require live validation.
