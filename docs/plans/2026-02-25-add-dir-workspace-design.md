# Add-Dir Workspace Feature Design

## Problem

When using Claude Code's `/add-dir` command inside a Manifold agent session, the added directories are invisible in the Manifold UI. Users have no way to browse, view, or edit files in those external directories from the sidebar or file tree.

## Goal

Show `/add-dir` directories in the Manifold UI with full interaction: browsable in the file tree (VS Code multi-root workspace style), visible in the sidebar under the agent, and fully editable (read/write/delete/rename).

## Approach

Add a new `AddDirDetector` module that pattern-matches PTY output for the `/add-dir` success line. When detected, update the session data model, persist to metadata, push events to the renderer, and render in both the sidebar and file tree.

## Data Model

### AgentSession (src/shared/types.ts)

Add `additionalDirs: string[]` — absolute paths added via `/add-dir`. Defaults to `[]`.

### worktree-meta.json

Add `additionalDirs: string[]` field for persistence across restarts.

### FileTreeNode

No changes. The renderer merges multiple root trees.

## PTY Output Detection

### New module: src/main/add-dir-detector.ts

Pattern: `Added <path> as a working directory for this session`

```typescript
class AddDirDetector {
  private pattern = /Added\s+(\/\S+)\s+as a working directory/

  detect(output: string): string | null {
    const match = output.match(this.pattern)
    return match ? match[1] : null
  }
}
```

### Wiring in SessionManager

When PTY data arrives (same place StatusDetector runs):
1. Run `AddDirDetector.detect()`
2. On match: add path to `session.additionalDirs` (deduplicate, normalize trailing slash)
3. Persist updated array to `worktree-meta.json`
4. Push `agent:dirs-changed` event to renderer

## IPC Layer

### New channels

| Channel | Type | Params | Returns | Purpose |
|---|---|---|---|---|
| `agent:dirs-changed` | listen (push) | — | `{ sessionId, additionalDirs: string[] }` | Pushed on new dir detected |
| `files:tree-dir` | invoke | `dirPath: string` | `FileTreeNode` | Get tree for an absolute path |

### Path validation update

Current: reject anything outside `session.worktreePath`.

New: allow paths within `session.worktreePath` OR within any `session.additionalDirs` entry.

### Files to update

- `src/main/ipc-handlers.ts` — register new handlers
- `src/preload/index.ts` — whitelist both new channels
- `src/main/ipc/file-handlers.ts` — add `files:tree-dir`, update path validation

## File Watching

### FileWatcher changes

- Extend from `sessionId -> watcher` to `sessionId -> { worktree: watcher, additionalDirs: Map<string, watcher> }`
- On `agent:dirs-changed`, start chokidar watcher for new directory
- Push `files:changed` events with same `sessionId`
- For git-backed additional dirs: poll `git status --porcelain`
- For non-git dirs: chokidar only, no git status indicators
- Detect git via: `git -C <dirPath> rev-parse --git-dir`
- Tear down all watchers on session cleanup

## Renderer — Sidebar

### AgentItem (ProjectSidebar.tsx)

Show compact directory list below agent label:

```
● oslo
  fix login · Claude
  📁 manifold-landingpage
  📁 shared-utils
```

- Display directory basename only
- Full path in tooltip on hover
- Click scrolls/highlights that root in file tree

## Renderer — File Tree

### Multi-root workspace (FileTree.tsx)

Render multiple root nodes, VS Code style:

```
MANIFOLD-ADD-DIR          (worktree, always first)
  ├── src/
  ├── package.json
MANIFOLD-LANDINGPAGE      (added dir)
  ├── pages/
  ├── styles/
```

Top-level collapsible headers with directory name in uppercase.

### New hook: useAdditionalDirs

```typescript
function useAdditionalDirs(sessionId: string | null) {
  // Listens to agent:dirs-changed
  // Fetches file trees via files:tree-dir for each dir
  // Returns { additionalDirs: string[], additionalTrees: FileTreeNode[] }
}
```

### useFileOperations update

Route file ops based on whether path falls within worktree or an additional dir.

## Persistence & Session Restore

- **On save:** Write `additionalDirs` to `worktree-meta.json` on every detection
- **On restore:** Read from `worktree-meta.json` during dormant session discovery, populate `session.additionalDirs`
- **On resume:** Already loaded from metadata; new `/add-dir` commands append as usual
- **No removal:** Directories are add-only in this iteration

## Files to Create

| File | Purpose |
|---|---|
| `src/main/add-dir-detector.ts` | Regex detector for PTY output |
| `src/main/add-dir-detector.test.ts` | Tests for detector |
| `src/renderer/hooks/useAdditionalDirs.ts` | Hook for dir state + tree fetching |

## Files to Modify

| File | Change |
|---|---|
| `src/shared/types.ts` | Add `additionalDirs: string[]` to `AgentSession` |
| `src/main/session-manager.ts` | Wire detector, persist dirs, push IPC events |
| `src/main/worktree-manager.ts` | Read/write `additionalDirs` in worktree-meta.json |
| `src/main/file-watcher.ts` | Watch additional dirs, git status for git-backed dirs |
| `src/main/ipc-handlers.ts` | Register `files:tree-dir` handler |
| `src/main/ipc/file-handlers.ts` | Add `files:tree-dir`, update path validation |
| `src/preload/index.ts` | Whitelist `agent:dirs-changed` and `files:tree-dir` |
| `src/renderer/components/ProjectSidebar.tsx` | Show dir list under AgentItem |
| `src/renderer/components/FileTree.tsx` | Multi-root rendering with workspace headers |
| `src/renderer/hooks/useFileOperations.ts` | Route file ops for additional dir paths |

## Out of Scope

- Manual "remove directory" UI action
- Drag-and-drop to add directories
- Support for other runtimes' equivalent commands
