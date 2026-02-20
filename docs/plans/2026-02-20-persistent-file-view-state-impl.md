# Persistent File View State Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist open file tabs, active file, code view mode, and file tree expansion state per agent session, surviving app restarts and restoring instantly on agent switch.

**Architecture:** A `ViewStateStore` in the main process (mirroring `SettingsStore`) persists per-session state to `~/.manifold/view-state.json`. Three IPC channels expose get/set/delete. A new renderer hook `useViewState` orchestrates save-on-switch-away and restore-on-switch-to, coordinating with `useCodeView` and a controlled `FileTree` component.

**Tech Stack:** TypeScript, Electron IPC, Node.js fs, React hooks, Vitest

---

### Task 1: Add SessionViewState type

**Files:**
- Modify: `src/shared/types.ts:44` (after ManifoldSettings)

**Step 1: Add the type**

Add after the `ManifoldSettings` interface (line 51):

```ts
export interface SessionViewState {
  openFilePaths: string[]
  activeFilePath: string | null
  codeViewMode: 'diff' | 'file'
  expandedPaths: string[]
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no consumers yet)

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add SessionViewState type for per-agent file view persistence"
```

---

### Task 2: Create ViewStateStore with tests (TDD)

**Files:**
- Create: `src/main/view-state-store.ts`
- Create: `src/main/view-state-store.test.ts`

**Step 1: Write the failing tests**

Create `src/main/view-state-store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
}))

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}))

import * as fs from 'node:fs'
import { ViewStateStore } from './view-state-store'

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockWriteFileSync = vi.mocked(fs.writeFileSync)
const mockMkdirSync = vi.mocked(fs.mkdirSync)

describe('ViewStateStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor / loadFromDisk', () => {
    it('returns empty map when file does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ViewStateStore()
      expect(store.get('nonexistent')).toBeNull()
    })

    it('loads existing state from disk', () => {
      const state = {
        'session-1': {
          openFilePaths: ['src/main.ts'],
          activeFilePath: 'src/main.ts',
          codeViewMode: 'file',
          expandedPaths: ['/worktree/src'],
        },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(state))

      const store = new ViewStateStore()
      expect(store.get('session-1')).toEqual(state['session-1'])
    })

    it('returns empty map when file contains invalid JSON', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('not json!')

      const store = new ViewStateStore()
      expect(store.get('any')).toBeNull()
    })

    it('returns empty map when readFileSync throws', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES')
      })

      const store = new ViewStateStore()
      expect(store.get('any')).toBeNull()
    })
  })

  describe('get', () => {
    it('returns null for unknown session', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ViewStateStore()
      expect(store.get('unknown')).toBeNull()
    })

    it('returns a copy (not the same reference)', () => {
      const state = {
        'session-1': {
          openFilePaths: ['a.ts'],
          activeFilePath: 'a.ts',
          codeViewMode: 'file' as const,
          expandedPaths: ['/src'],
        },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(state))

      const store = new ViewStateStore()
      const a = store.get('session-1')
      const b = store.get('session-1')
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })
  })

  describe('set', () => {
    it('saves state and writes to disk', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ViewStateStore()

      const viewState = {
        openFilePaths: ['src/index.ts'],
        activeFilePath: 'src/index.ts',
        codeViewMode: 'file' as const,
        expandedPaths: ['/worktree/src'],
      }

      store.set('session-1', viewState)
      expect(store.get('session-1')).toEqual(viewState)
      expect(mockMkdirSync).toHaveBeenCalled()
      expect(mockWriteFileSync).toHaveBeenCalledOnce()
    })

    it('overwrites existing state for same session', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ViewStateStore()

      store.set('session-1', {
        openFilePaths: ['a.ts'],
        activeFilePath: 'a.ts',
        codeViewMode: 'file',
        expandedPaths: [],
      })

      store.set('session-1', {
        openFilePaths: ['b.ts'],
        activeFilePath: 'b.ts',
        codeViewMode: 'diff',
        expandedPaths: ['/src'],
      })

      expect(store.get('session-1')?.openFilePaths).toEqual(['b.ts'])
    })
  })

  describe('delete', () => {
    it('removes state for a session and writes to disk', () => {
      const state = {
        'session-1': {
          openFilePaths: ['a.ts'],
          activeFilePath: 'a.ts',
          codeViewMode: 'file',
          expandedPaths: [],
        },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(state))

      const store = new ViewStateStore()
      store.delete('session-1')

      expect(store.get('session-1')).toBeNull()
      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('is a no-op for unknown session (still writes)', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ViewStateStore()
      store.delete('unknown')
      expect(store.get('unknown')).toBeNull()
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/view-state-store.test.ts`
Expected: FAIL — module `./view-state-store` not found

**Step 3: Write the implementation**

Create `src/main/view-state-store.ts`:

```ts
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { SessionViewState } from '../shared/types'

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const STATE_FILE = path.join(CONFIG_DIR, 'view-state.json')

export class ViewStateStore {
  private state: Map<string, SessionViewState>

  constructor() {
    this.state = this.loadFromDisk()
  }

  private ensureConfigDir(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }

  private loadFromDisk(): Map<string, SessionViewState> {
    try {
      if (!fs.existsSync(STATE_FILE)) {
        return new Map()
      }
      const raw = fs.readFileSync(STATE_FILE, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return new Map()
      }
      return new Map(Object.entries(parsed as Record<string, SessionViewState>))
    } catch {
      return new Map()
    }
  }

  private writeToDisk(): void {
    this.ensureConfigDir()
    const obj = Object.fromEntries(this.state)
    fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2), 'utf-8')
  }

  get(sessionId: string): SessionViewState | null {
    const entry = this.state.get(sessionId)
    if (!entry) return null
    return { ...entry, openFilePaths: [...entry.openFilePaths], expandedPaths: [...entry.expandedPaths] }
  }

  set(sessionId: string, viewState: SessionViewState): void {
    this.state.set(sessionId, { ...viewState })
    this.writeToDisk()
  }

  delete(sessionId: string): void {
    this.state.delete(sessionId)
    this.writeToDisk()
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/view-state-store.test.ts`
Expected: All PASS

**Step 5: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/main/view-state-store.ts src/main/view-state-store.test.ts
git commit -m "feat: add ViewStateStore for per-session file view persistence"
```

---

### Task 3: Wire ViewStateStore into main process and IPC

**Files:**
- Modify: `src/main/index.ts:38` (add viewStateStore instance)
- Modify: `src/main/index.ts:75-82` (pass to registerIpcHandlers)
- Modify: `src/main/ipc-handlers.ts:18-25` (add to IpcDependencies)
- Modify: `src/main/ipc-handlers.ts:27-35` (call new register function)
- Modify: `src/preload/index.ts:3-27` (add channels to whitelist)

**Step 1: Add ViewStateStore instance in `src/main/index.ts`**

After line 38 (`const settingsStore = new SettingsStore()`), add:

```ts
import { ViewStateStore } from './view-state-store'
```

After the SettingsStore instantiation (line 38), add:

```ts
const viewStateStore = new ViewStateStore()
```

Pass it to `registerIpcHandlers` — update the object at lines 75-82 to include `viewStateStore`:

```ts
registerIpcHandlers({
  settingsStore,
  projectRegistry,
  sessionManager,
  fileWatcher,
  diffProvider,
  prCreator,
  viewStateStore,
})
```

**Step 2: Add to IpcDependencies and register handler in `src/main/ipc-handlers.ts`**

Add import at top:

```ts
import { ViewStateStore } from './view-state-store'
import type { SessionViewState } from '../shared/types'
```

Add to `IpcDependencies` interface:

```ts
viewStateStore: ViewStateStore
```

Add `registerViewStateHandlers(deps)` call in `registerIpcHandlers()`.

Add the handler function:

```ts
function registerViewStateHandlers(deps: IpcDependencies): void {
  const { viewStateStore } = deps

  ipcMain.handle('view-state:get', (_event, sessionId: string) => {
    return viewStateStore.get(sessionId)
  })

  ipcMain.handle('view-state:set', (_event, sessionId: string, state: SessionViewState) => {
    viewStateStore.set(sessionId, state)
  })

  ipcMain.handle('view-state:delete', (_event, sessionId: string) => {
    viewStateStore.delete(sessionId)
  })
}
```

**Step 3: Add channels to preload whitelist in `src/preload/index.ts`**

Add to `ALLOWED_INVOKE_CHANNELS` array (before the closing `] as const`):

```ts
'view-state:get',
'view-state:set',
'view-state:delete',
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/index.ts src/main/ipc-handlers.ts src/preload/index.ts
git commit -m "feat: wire ViewStateStore IPC channels into main process"
```

---

### Task 4: Add cleanup on agent deletion

**Files:**
- Modify: `src/main/ipc-handlers.ts:110-116` (agent:kill handler)

**Step 1: Add view state cleanup to agent:kill handler**

In `registerAgentHandlers`, modify the `agent:kill` handler to also delete view state:

```ts
ipcMain.handle('agent:kill', async (_event, sessionId: string) => {
  const session = sessionManager.getSession(sessionId)
  if (session) {
    await fileWatcher.unwatch(session.worktreePath)
  }
  await sessionManager.killSession(sessionId)
  deps.viewStateStore.delete(sessionId)
})
```

Note: `deps` needs to be available — update `registerAgentHandlers` to destructure `viewStateStore` from `deps`:

```ts
function registerAgentHandlers(deps: IpcDependencies): void {
  const { sessionManager, fileWatcher, viewStateStore } = deps
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat: cleanup view state on agent deletion"
```

---

### Task 5: Make FileTree expansion controlled

**Files:**
- Modify: `src/renderer/components/FileTree.tsx:4-9` (props interface)
- Modify: `src/renderer/components/FileTree.tsx:62-103` (TreeNode component)

**Step 1: Update FileTree props**

Add two new props to `FileTreeProps`:

```ts
interface FileTreeProps {
  tree: FileTreeNode | null
  changes: FileChange[]
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  onSelectFile: (path: string) => void
  onShowDiff: () => void
}
```

Pass `expandedPaths` and `onToggleExpand` through to `TreeNode`:

```tsx
<TreeNode
  node={tree}
  depth={0}
  changeMap={changeMap}
  expandedPaths={expandedPaths}
  onToggleExpand={onToggleExpand}
  onSelectFile={onSelectFile}
/>
```

**Step 2: Update TreeNode to use controlled expansion**

Update `TreeNodeProps`:

```ts
interface TreeNodeProps {
  node: FileTreeNode
  depth: number
  changeMap: Map<string, FileChangeType>
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  onSelectFile: (path: string) => void
}
```

Replace the internal `useState` with the controlled prop:

```tsx
function TreeNode({
  node,
  depth,
  changeMap,
  expandedPaths,
  onToggleExpand,
  onSelectFile,
}: TreeNodeProps): React.JSX.Element {
  const expanded = expandedPaths.has(node.path)

  const handleToggle = useCallback((): void => {
    if (node.isDirectory) {
      onToggleExpand(node.path)
    } else {
      onSelectFile(node.path)
    }
  }, [node.isDirectory, node.path, onToggleExpand, onSelectFile])

  const changeType = changeMap.get(node.path)

  return (
    <>
      <NodeRow
        node={node}
        depth={depth}
        expanded={expanded}
        changeType={changeType ?? null}
        onToggle={handleToggle}
      />
      {node.isDirectory && expanded && node.children && (
        <>
          {sortChildren(node.children).map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              changeMap={changeMap}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              onSelectFile={onSelectFile}
            />
          ))}
        </>
      )}
    </>
  )
}
```

Remove `useState` from the `react` import in `FileTree.tsx` (no longer needed — only `useCallback` and `useMemo` remain).

**Step 3: Run typecheck (expect errors — callers not updated yet)**

Run: `npm run typecheck`
Expected: FAIL — `MainPanes.tsx` doesn't pass the new props. This is expected and will be fixed in Task 7.

**Step 4: Commit**

```bash
git add src/renderer/components/FileTree.tsx
git commit -m "refactor: make FileTree expansion state controlled via props"
```

---

### Task 6: Create useViewState hook

**Files:**
- Create: `src/renderer/hooks/useViewState.ts`

**Step 1: Write the hook**

```ts
import { useState, useCallback, useEffect, useRef } from 'react'
import type { SessionViewState } from '../../shared/types'
import type { OpenFile } from './useCodeView'

interface UseViewStateResult {
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  restoreCodeView: {
    openFiles: OpenFile[]
    activeFilePath: string | null
    codeViewMode: 'diff' | 'file'
  } | null
  saveCurrentState: (
    openFiles: OpenFile[],
    activeFilePath: string | null,
    codeViewMode: 'diff' | 'file'
  ) => void
}

export function useViewState(activeSessionId: string | null): UseViewStateResult {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [restoreCodeView, setRestoreCodeView] = useState<UseViewStateResult['restoreCodeView']>(null)
  const prevSessionIdRef = useRef<string | null>(null)
  const expandedPathsRef = useRef<Set<string>>(expandedPaths)
  expandedPathsRef.current = expandedPaths

  const onToggleExpand = useCallback((path: string): void => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const saveCurrentState = useCallback(
    (openFiles: OpenFile[], activeFilePath: string | null, codeViewMode: 'diff' | 'file'): void => {
      const sessionId = prevSessionIdRef.current
      if (!sessionId) return

      const state: SessionViewState = {
        openFilePaths: openFiles.map((f) => f.path),
        activeFilePath,
        codeViewMode,
        expandedPaths: Array.from(expandedPathsRef.current),
      }

      void window.electronAPI.invoke('view-state:set', sessionId, state)
    },
    []
  )

  // On session change: load the new session's state
  useEffect(() => {
    prevSessionIdRef.current = activeSessionId

    if (!activeSessionId) {
      setExpandedPaths(new Set())
      setRestoreCodeView(null)
      return
    }

    void (async (): Promise<void> => {
      try {
        const state = (await window.electronAPI.invoke(
          'view-state:get',
          activeSessionId
        )) as SessionViewState | null

        if (state) {
          setExpandedPaths(new Set(state.expandedPaths))

          // Load file contents for restored tabs
          const openFiles: OpenFile[] = []
          for (const filePath of state.openFilePaths) {
            try {
              const content = (await window.electronAPI.invoke(
                'files:read',
                activeSessionId,
                filePath
              )) as string
              openFiles.push({ path: filePath, content })
            } catch {
              // File may have been deleted — skip it
            }
          }

          setRestoreCodeView({
            openFiles,
            activeFilePath: state.activeFilePath,
            codeViewMode: state.codeViewMode,
          })
        } else {
          // No saved state — default to root expanded
          setExpandedPaths(new Set())
          setRestoreCodeView(null)
        }
      } catch {
        setExpandedPaths(new Set())
        setRestoreCodeView(null)
      }
    })()
  }, [activeSessionId])

  return {
    expandedPaths,
    onToggleExpand,
    restoreCodeView,
    saveCurrentState,
  }
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (hook has no consumers yet)

**Step 3: Commit**

```bash
git add src/renderer/hooks/useViewState.ts
git commit -m "feat: add useViewState hook for per-session file view persistence"
```

---

### Task 7: Add restoreState to useCodeView

**Files:**
- Modify: `src/renderer/hooks/useCodeView.ts`

**Step 1: Add restoreState method**

Add a new function to `useCodeView` that allows external state restoration, and export it in the result interface.

Add to `UseCodeViewResult`:

```ts
restoreState: (openFiles: OpenFile[], activeFilePath: string | null, codeViewMode: CodeViewMode) => void
```

Add the implementation inside `useCodeView`:

```ts
const restoreState = useCallback(
  (files: OpenFile[], filePath: string | null, mode: CodeViewMode): void => {
    setOpenFiles(files)
    setActiveFilePath(filePath)
    setCodeViewMode(mode)
  },
  []
)
```

Return `restoreState` in the return object.

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/hooks/useCodeView.ts
git commit -m "feat: add restoreState method to useCodeView for session switching"
```

---

### Task 8: Wire everything together in App.tsx and MainPanes

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/MainPanes.tsx`

**Step 1: Update App.tsx**

Import `useViewState`:

```ts
import { useViewState } from './hooks/useViewState'
```

Instantiate after `useCodeView`:

```ts
const viewState = useViewState(activeSessionId)
```

Add an effect to save state before switching and restore after:

```ts
// Save state before switching away from a session
const prevSessionRef = useRef<string | null>(null)

useEffect(() => {
  // Save previous session's state
  if (prevSessionRef.current && prevSessionRef.current !== activeSessionId) {
    viewState.saveCurrentState(
      codeView.openFiles,
      codeView.activeFilePath,
      codeView.codeViewMode
    )
  }
  prevSessionRef.current = activeSessionId
}, [activeSessionId])

// Restore state when viewState provides it
useEffect(() => {
  if (viewState.restoreCodeView) {
    codeView.restoreState(
      viewState.restoreCodeView.openFiles,
      viewState.restoreCodeView.activeFilePath,
      viewState.restoreCodeView.codeViewMode
    )
  }
}, [viewState.restoreCodeView])
```

Add `useRef` to the React import if not already imported.

Pass new props to `MainPanes`:

```tsx
<MainPanes
  ...existing props...
  expandedPaths={viewState.expandedPaths}
  onToggleExpand={viewState.onToggleExpand}
/>
```

Also save state on agent deletion (update `deleteAgent` call or add cleanup):

```ts
const handleDeleteAgent = useCallback(
  (sessionId: string): void => {
    void deleteAgent(sessionId)
    void window.electronAPI.invoke('view-state:delete', sessionId)
  },
  [deleteAgent]
)
```

Use `handleDeleteAgent` instead of `deleteAgent` in the `ProjectSidebar` `onDeleteAgent` prop.

**Step 2: Update MainPanes props and pass through to FileTree**

Add to `MainPanesProps`:

```ts
expandedPaths: Set<string>
onToggleExpand: (path: string) => void
```

Pass to `FileTree`:

```tsx
<FileTree
  tree={tree}
  changes={changes}
  expandedPaths={expandedPaths}
  onToggleExpand={onToggleExpand}
  onSelectFile={onSelectFile}
  onShowDiff={onShowDiff}
/>
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/MainPanes.tsx
git commit -m "feat: wire view state persistence through App and MainPanes"
```

---

### Task 9: Auto-expand root directory for new sessions

**Files:**
- Modify: `src/renderer/hooks/useViewState.ts`

**Step 1: Auto-expand root when tree loads for first time**

The `useViewState` hook needs to set the root path as expanded when a session has no saved state but the file tree is available. Update the hook to accept the tree and auto-expand:

Add `tree: FileTreeNode | null` as a parameter to `useViewState`.

In the effect where `state` is null (no saved state), set the root expanded:

```ts
// No saved state — auto-expand root if tree is available
if (tree) {
  setExpandedPaths(new Set([tree.path]))
} else {
  setExpandedPaths(new Set())
}
```

Update `App.tsx` to pass `tree` to `useViewState`:

```ts
const viewState = useViewState(activeSessionId, tree)
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/hooks/useViewState.ts src/renderer/App.tsx
git commit -m "feat: auto-expand root directory for sessions without saved state"
```

---

### Task 10: Final verification

**Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 2: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 3: Manual smoke test**

Run: `npm run dev`

Test these scenarios:
1. Open agent A, expand some folders, open 2 files in tabs
2. Switch to agent B — tree and tabs should reset (no saved state for B)
3. Open files in agent B, expand different folders
4. Switch back to agent A — tabs and expansion state restored
5. Switch back to agent B — tabs and expansion state restored
6. Quit and restart app — switch to agent A, state should be restored from disk
7. Delete agent A — switch to another agent, verify no stale state

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
