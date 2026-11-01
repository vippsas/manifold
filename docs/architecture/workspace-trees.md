---
description: Cached sidebar folder trees and coalesced reloads for shared checkout events.
covers: [src/renderer/hooks/editor/useWorkspaceTree.ts]
updated: 2026-11-01
owner: see .github/CODEOWNERS
---

# Workspace folder trees

`useWorkspaceTree` fetches a sidebar folder through `files:tree-by-project` for a project
or `files:tree` for a session (`src/renderer/hooks/editor/useWorkspaceTree.ts:68`). Its cache
keeps the tree and expanded paths across unmounts, keyed by source kind, id and workspace
(`useWorkspaceTree.ts:12`, `:20`, `:22`). Reloads retain expanded paths and open the root on
the first load (`useWorkspaceTree.ts:78`).

The hook matches `files:tree-changed` by `rootPath` or, for session folders, by session id;
additional-directory `files:changed` matches the exact `source` string
(`useWorkspaceTree.ts:133`, `:138`). Window focus and explicit
refresh use the same reload path (`useWorkspaceTree.ts:56`, `:142`). The main process still
sends tree events for every primary session, preserving consumers that filter by session id
(`src/main/fs/file-watcher.ts:42`, `src/renderer/hooks/editor/useFileWatcher.ts:95`).

A `null` `files:tree` reply leaves the cached tree and expanded paths intact
(`useWorkspaceTree.ts:73`). Discovery emits a `files:tree-changed` event with the adopted
session id and `reason: 'session-discovered'` (`src/main/session/session-manager-context.ts:83`).
Matching by id lets an uncached session folder retry before its first tree reveals the root.

For one mounted folder, a zero-delay timer batches a burst of matching events before starting
a walk. While the request is pending, further refreshes set one trailing reload; they cannot
start overlapping walks. The trailing reload runs after completion, including after failure
(`useWorkspaceTree.ts:62`, `:88`, `:97`). Failures preserve the cached tree; changing folders
or unmounting discards old results and cancels scheduled reloads (`useWorkspaceTree.ts:74`,
`:86`, `:109`).

`src/main/fs/file-watcher-workspace-tree.test.tsx` drives the real `FileWatcher` fan-out
with two primaries and fake tree/IPC adapters. It pins one walk per burst, one trailing walk
for changes during a request, failure recovery, folder matching, and teardown cancellation.
`src/renderer/hooks/editor/useWorkspaceTree.test.ts:15` pins null replies and
discovery retries for an uncached session folder.
These checks run offline; Electron delivery timing and the macOS app require live validation.
