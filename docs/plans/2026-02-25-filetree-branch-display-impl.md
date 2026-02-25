# File Tree Branch Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the git branch name (or path fallback) as a subtitle under each directory root in the file tree, with an "external" label for `/add-dir` directories.

**Architecture:** New IPC channel `files:dir-branch` runs `git rev-parse --abbrev-ref HEAD` in the main process. The renderer hook `useAdditionalDirs` fetches branch info alongside trees. `WorkspaceRootHeader` gains subtitle + "external" label rendering.

**Tech Stack:** Electron IPC, React, node:child_process (execFile)

---

### Task 1: Add `files:dir-branch` IPC handler in main process

**Files:**
- Modify: `src/main/ipc/file-handlers.ts:16-32`

**Step 1: Add the handler**

After the existing `files:tree-dir` handler (line 32), add:

```typescript
ipcMain.handle('files:dir-branch', async (_event, dirPath: string) => {
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execFileAsync = promisify(execFile)
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: dirPath,
      timeout: 5000,
    })
    return stdout.trim() || null
  } catch {
    return null
  }
})
```

**Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/main/ipc/file-handlers.ts
git commit -m "feat: add files:dir-branch IPC handler"
```

---

### Task 2: Whitelist `files:dir-branch` in preload

**Files:**
- Modify: `src/preload/index.ts:3-55`

**Step 1: Add channel to whitelist**

In `ALLOWED_INVOKE_CHANNELS` array, after `'files:rename'` (line 24), add `'files:dir-branch'`:

```typescript
'files:rename',
'files:dir-branch',
```

**Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: whitelist files:dir-branch IPC channel"
```

---

### Task 3: Fetch branch info in `useAdditionalDirs` hook

**Files:**
- Modify: `src/renderer/hooks/useAdditionalDirs.ts`

**Step 1: Add branch state and fetching**

Add a `Map<string, string | null>` state for branches. Fetch branch alongside tree for each directory.

The full updated hook:

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { FileTreeNode } from '../../shared/types'

interface UseAdditionalDirsResult {
  additionalDirs: string[]
  additionalTrees: Map<string, FileTreeNode>
  additionalBranches: Map<string, string | null>
  refreshTree: (dirPath: string) => Promise<void>
}

export function useAdditionalDirs(activeSessionId: string | null): UseAdditionalDirsResult {
  const [additionalDirs, setAdditionalDirs] = useState<string[]>([])
  const [additionalTrees, setAdditionalTrees] = useState<Map<string, FileTreeNode>>(new Map())
  const [additionalBranches, setAdditionalBranches] = useState<Map<string, string | null>>(new Map())

  // Reset when session changes
  useEffect(() => {
    if (!activeSessionId) {
      setAdditionalDirs([])
      setAdditionalTrees(new Map())
      setAdditionalBranches(new Map())
      return
    }

    // Load persisted dirs from session data
    window.electronAPI.invoke('agent:sessions').then((sessions: unknown) => {
      const sessionList = sessions as Array<{ id: string; additionalDirs: string[] }>
      const session = sessionList.find((s) => s.id === activeSessionId)
      if (session?.additionalDirs?.length) {
        setAdditionalDirs(session.additionalDirs)
        for (const dir of session.additionalDirs) {
          fetchTree(activeSessionId, dir)
          fetchBranch(dir)
        }
      }
    }).catch(() => {})
  }, [activeSessionId])

  // Listen for new dirs added
  useEffect(() => {
    if (!activeSessionId) return

    const unsub = window.electronAPI.on('agent:dirs-changed', (payload: unknown) => {
      const { sessionId, additionalDirs: dirs } = payload as {
        sessionId: string
        additionalDirs: string[]
      }
      if (sessionId !== activeSessionId) return
      setAdditionalDirs(dirs)

      for (const dir of dirs) {
        fetchTree(activeSessionId, dir)
        fetchBranch(dir)
      }
    })

    return unsub
  }, [activeSessionId])

  // Refresh trees and branches on files:changed with source
  useEffect(() => {
    if (!activeSessionId || additionalDirs.length === 0) return

    const unsub = window.electronAPI.on('files:changed', (payload: unknown) => {
      const { sessionId, source } = payload as { sessionId: string; source?: string }
      if (sessionId !== activeSessionId || !source) return
      if (additionalDirs.includes(source)) {
        fetchTree(activeSessionId, source)
        fetchBranch(source)
      }
    })

    return unsub
  }, [activeSessionId, additionalDirs])

  function fetchTree(sessionId: string, dirPath: string): void {
    window.electronAPI.invoke('files:tree-dir', sessionId, dirPath).then((tree) => {
      setAdditionalTrees((prev) => {
        const next = new Map(prev)
        next.set(dirPath, tree as FileTreeNode)
        return next
      })
    }).catch(() => {})
  }

  function fetchBranch(dirPath: string): void {
    window.electronAPI.invoke('files:dir-branch', dirPath).then((branch) => {
      setAdditionalBranches((prev) => {
        const next = new Map(prev)
        next.set(dirPath, branch as string | null)
        return next
      })
    }).catch(() => {})
  }

  const refreshTree = useCallback(async (dirPath: string) => {
    if (!activeSessionId) return
    fetchTree(activeSessionId, dirPath)
    fetchBranch(dirPath)
  }, [activeSessionId])

  return { additionalDirs, additionalTrees, additionalBranches, refreshTree }
}
```

**Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (there will be an unused-variable warning in App.tsx until we thread it through — that's fine, we fix it in the next task)

**Step 3: Commit**

```bash
git add src/renderer/hooks/useAdditionalDirs.ts
git commit -m "feat: fetch branch info for additional directories"
```

---

### Task 4: Thread branch info through DockState to FileTree

**Files:**
- Modify: `src/renderer/App.tsx:58,171`
- Modify: `src/renderer/components/dock-panels.tsx:13-60,157-177`

**Step 1: Destructure `additionalBranches` in App.tsx**

In `src/renderer/App.tsx` line 58, change:

```typescript
const { additionalTrees } = useAdditionalDirs(activeSessionId)
```

to:

```typescript
const { additionalTrees, additionalBranches } = useAdditionalDirs(activeSessionId)
```

**Step 2: Add `additionalBranches` and `primaryBranch` to DockAppState context value**

In `src/renderer/App.tsx`, in the `useMemo` block that builds the DockStateContext value (around line 155-195), add these two new properties alongside `additionalTrees` (line 171):

```typescript
additionalTrees,
additionalBranches,
primaryBranch: activeSession?.branchName ?? null,
```

**Step 3: Add to DockAppState interface**

In `src/renderer/components/dock-panels.tsx`, add to the `DockAppState` interface (after line 32):

```typescript
additionalBranches?: Map<string, string | null>
primaryBranch: string | null
```

**Step 4: Pass new props to FileTree in FileTreePanel**

In `src/renderer/components/dock-panels.tsx`, update `FileTreePanel` (lines 157-177) to pass the new props:

```typescript
function FileTreePanel(): React.JSX.Element {
  const s = useDockState()
  const openFilePaths = useMemo(
    () => new Set(s.openFiles.map((f) => f.path)),
    [s.openFiles]
  )
  return (
    <FileTree
      tree={s.tree}
      additionalTrees={s.additionalTrees}
      additionalBranches={s.additionalBranches}
      primaryBranch={s.primaryBranch}
      changes={s.changes}
      activeFilePath={s.activeFilePath}
      openFilePaths={openFilePaths}
      expandedPaths={s.expandedPaths}
      onToggleExpand={s.onToggleExpand}
      onSelectFile={s.onSelectFile}
      onDeleteFile={s.onDeleteFile}
      onRenameFile={s.onRenameFile}
    />
  )
}
```

**Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (FileTree doesn't accept the new props yet — TypeScript won't error since they're extra props passed to a component, but we'll add them in the next task)

**Step 6: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/dock-panels.tsx
git commit -m "feat: thread branch info through DockState to FileTree"
```

---

### Task 5: Update `WorkspaceRootHeader` and `FileTree` to display branch/path subtitle

**Files:**
- Modify: `src/renderer/components/FileTree.tsx`

**Step 1: Update FileTreeProps interface**

Add new props to `FileTreeProps` (line 6-17):

```typescript
interface FileTreeProps {
  tree: FileTreeNode | null
  additionalTrees?: Map<string, FileTreeNode>
  additionalBranches?: Map<string, string | null>
  primaryBranch: string | null
  changes: FileChange[]
  activeFilePath: string | null
  openFilePaths: Set<string>
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  onSelectFile: (path: string) => void
  onDeleteFile?: (path: string) => void
  onRenameFile?: (oldPath: string, newPath: string) => void
}
```

**Step 2: Rewrite `WorkspaceRootHeader`**

Replace the existing `WorkspaceRootHeader` (lines 19-35) with:

```typescript
function WorkspaceRootHeader({
  name,
  subtitle,
  isAdditional,
}: {
  name: string
  subtitle: string | null
  isAdditional: boolean
}): React.JSX.Element {
  return (
    <div
      style={{
        padding: '6px 8px 4px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          color: 'var(--text-secondary)',
          letterSpacing: '0.05em',
        }}
      >
        <span>{name}</span>
        {isAdditional && (
          <span
            style={{
              fontWeight: 400,
              textTransform: 'lowercase' as const,
              color: 'var(--text-tertiary, rgba(255,255,255,0.35))',
              letterSpacing: 'normal',
            }}
          >
            external
          </span>
        )}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: '10px',
            fontWeight: 400,
            color: 'var(--text-tertiary, rgba(255,255,255,0.35))',
            marginTop: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' as const,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  )
}
```

**Step 3: Add a helper to shorten paths**

Add this above the `FileTree` component:

```typescript
function shortenPath(fullPath: string): string {
  const home = typeof process !== 'undefined' ? process.env.HOME : undefined
  if (home && fullPath.startsWith(home)) {
    return '~' + fullPath.slice(home.length)
  }
  return fullPath
}
```

Note: In Electron renderer with context isolation, `process.env.HOME` may not be available. We should derive the home dir from the path itself. A simpler approach — since the tree path is always absolute and we're in macOS, we can check for `/Users/<name>/`:

```typescript
function shortenPath(fullPath: string): string {
  const match = fullPath.match(/^\/Users\/[^/]+/)
  if (match) {
    return '~' + fullPath.slice(match[0].length)
  }
  return fullPath
}
```

**Step 4: Update FileTree component to destructure and pass new props**

Update the destructuring (line 37-48) to include the new props:

```typescript
export function FileTree({
  tree,
  additionalTrees,
  additionalBranches,
  primaryBranch,
  changes,
  activeFilePath,
  openFilePaths,
  expandedPaths,
  onToggleExpand,
  onSelectFile,
  onDeleteFile,
  onRenameFile,
}: FileTreeProps): React.JSX.Element {
```

**Step 5: Update the rendering of headers**

Replace lines 112-122 (the section that renders headers with additional trees) with:

```typescript
{additionalTrees && additionalTrees.size > 0 ? (
  <>
    <WorkspaceRootHeader
      name={tree.name}
      subtitle={primaryBranch}
      isAdditional={false}
    />
    <TreeNode node={tree} depth={0} changeMap={changeMap} activeFilePath={activeFilePath} selectedFilePath={selectedFilePath} openFilePaths={openFilePaths} expandedPaths={expandedPaths} onToggleExpand={onToggleExpand} onHighlightFile={setSelectedFilePath} onSelectFile={onSelectFile} onRequestDelete={onDeleteFile ? handleRequestDelete : undefined} renamingPath={renamingPath} renameValue={renameValue} onRenameValueChange={setRenameValue} onStartRename={onRenameFile ? handleStartRename : undefined} onConfirmRename={handleConfirmRename} onCancelRename={handleCancelRename} />
    {Array.from(additionalTrees.entries()).map(([dirPath, dirTree]) => {
      const branch = additionalBranches?.get(dirPath)
      const subtitle = branch ?? shortenPath(dirPath)
      return (
        <React.Fragment key={dirPath}>
          <WorkspaceRootHeader
            name={dirTree.name}
            subtitle={subtitle}
            isAdditional={true}
          />
          <TreeNode node={dirTree} depth={0} changeMap={changeMap} activeFilePath={activeFilePath} selectedFilePath={selectedFilePath} openFilePaths={openFilePaths} expandedPaths={expandedPaths} onToggleExpand={onToggleExpand} onHighlightFile={setSelectedFilePath} onSelectFile={onSelectFile} onRequestDelete={onDeleteFile ? handleRequestDelete : undefined} renamingPath={renamingPath} renameValue={renameValue} onRenameValueChange={setRenameValue} onStartRename={onRenameFile ? handleStartRename : undefined} onConfirmRename={handleConfirmRename} onCancelRename={handleCancelRename} />
        </React.Fragment>
      )
    })}
  </>
```

**Step 6: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

**Step 7: Verify visually**

Run: `npm run dev`
Expected: Primary worktree shows header + branch subtitle. Additional dirs show header + "external" label + branch subtitle.

**Step 8: Commit**

```bash
git add src/renderer/components/FileTree.tsx
git commit -m "feat: display branch name and external label in file tree headers"
```

---

### Task 6: Run full test suite and final typecheck

**Files:** None (verification only)

**Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Commit if any fixes were needed**

If any fixes were required, commit them:

```bash
git commit -m "fix: address typecheck/test issues in filetree branch display"
```
