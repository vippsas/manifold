# Add-Dir Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect Claude Code's `/add-dir` command via PTY output and display added directories in the sidebar and file tree with full read/write interaction, VS Code multi-root workspace style.

**Architecture:** New `AddDirDetector` module pattern-matches PTY output. `SessionManager` wires it into the data callback, persists dirs via worktree metadata, and pushes events to the renderer. The renderer shows dirs in the sidebar and renders a multi-root file tree.

**Tech Stack:** TypeScript, Electron IPC, React, vitest

---

### Task 1: AddDirDetector — Test & Implementation

**Files:**
- Create: `src/main/add-dir-detector.ts`
- Create: `src/main/add-dir-detector.test.ts`

**Step 1: Write the failing test**

In `src/main/add-dir-detector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { detectAddDir } from './add-dir-detector'

describe('detectAddDir', () => {
  it('returns the path when output contains the success line', () => {
    const output = 'Added /Users/sven/git/landingpage/ as a working directory for this session'
    expect(detectAddDir(output)).toBe('/Users/sven/git/landingpage')
  })

  it('returns null when output does not contain the pattern', () => {
    expect(detectAddDir('some random output')).toBeNull()
  })

  it('strips trailing slash from detected path', () => {
    const output = 'Added /tmp/mydir/ as a working directory for this session'
    expect(detectAddDir(output)).toBe('/tmp/mydir')
  })

  it('handles path without trailing slash', () => {
    const output = 'Added /tmp/mydir as a working directory for this session'
    expect(detectAddDir(output)).toBe('/tmp/mydir')
  })

  it('extracts path from multi-line output', () => {
    const output = [
      'some previous output',
      '└ Added /Users/sven/git/landingpage/ as a working directory for this session · /permissions to manage',
      '❯ ',
    ].join('\n')
    expect(detectAddDir(output)).toBe('/Users/sven/git/landingpage')
  })

  it('handles paths with spaces', () => {
    const output = 'Added /Users/sven/my project/ as a working directory for this session'
    expect(detectAddDir(output)).toBe('/Users/sven/my project')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/add-dir-detector.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

In `src/main/add-dir-detector.ts`:

```typescript
const ADD_DIR_PATTERN = /Added\s+(.+?)\s+as a working directory/

export function detectAddDir(output: string): string | null {
  const match = output.match(ADD_DIR_PATTERN)
  if (!match) return null
  return match[1].replace(/\/+$/, '')
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/add-dir-detector.test.ts`
Expected: all 6 tests PASS

**Step 5: Commit**

```bash
git add src/main/add-dir-detector.ts src/main/add-dir-detector.test.ts
git commit -m "feat: add AddDirDetector for parsing /add-dir PTY output"
```

---

### Task 2: Data Model — Add `additionalDirs` to AgentSession

**Files:**
- Modify: `src/shared/types.ts:14-23` (AgentSession interface)
- Modify: `src/main/worktree-meta.ts:4-6` (WorktreeMeta interface)

**Step 1: Add `additionalDirs` to `AgentSession`**

In `src/shared/types.ts`, add field to `AgentSession` (after line 22):

```typescript
export interface AgentSession {
  id: string
  projectId: string
  runtimeId: string
  branchName: string
  worktreePath: string
  status: AgentStatus
  pid: number | null
  taskDescription?: string
  additionalDirs: string[]
}
```

**Step 2: Add `additionalDirs` to `WorktreeMeta`**

In `src/main/worktree-meta.ts`, update the interface:

```typescript
export interface WorktreeMeta {
  runtimeId: string
  taskDescription?: string
  additionalDirs?: string[]
}
```

**Step 3: Run typecheck to find all breakages**

Run: `npm run typecheck`
Expected: Errors in `session-manager.ts` where `AgentSession` objects are constructed without `additionalDirs`.

**Step 4: Fix SessionManager — add `additionalDirs` to session construction**

In `src/main/session-manager.ts`:

- `buildSession()` (line 110-121): add `additionalDirs: []` to the returned object
- `discoverSessionsForProject()` (line 224-235): add `additionalDirs: meta?.additionalDirs ?? []` to the dormant session
- `toPublicSession()` (line 306-316): add `additionalDirs: session.additionalDirs` to the returned object
- `createShellSession()` (line 257-267): add `additionalDirs: []` to the session

**Step 5: Run typecheck again**

Run: `npm run typecheck`
Expected: PASS (no more errors)

**Step 6: Run existing tests to verify nothing is broken**

Run: `npm test`
Expected: All existing tests PASS

**Step 7: Commit**

```bash
git add src/shared/types.ts src/main/worktree-meta.ts src/main/session-manager.ts
git commit -m "feat: add additionalDirs field to AgentSession and WorktreeMeta"
```

---

### Task 3: Wire AddDirDetector into SessionManager

**Files:**
- Modify: `src/main/session-manager.ts:276-293` (wireOutputStreaming method)
- Modify: `src/main/session-manager.test.ts`

**Step 1: Write the failing test**

Add to the bottom of `src/main/session-manager.test.ts`, inside the existing `describe('SessionManager')` block:

```typescript
describe('add-dir detection', () => {
  it('detects added directory from PTY output and updates session', async () => {
    const mockWindow = createMockWindow()
    sessionManager.setMainWindow(mockWindow)

    await sessionManager.createSession({
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'test',
    })

    // Get the onData callback
    const onDataCall = (ptyPool.onData as ReturnType<typeof vi.fn>).mock.calls[0]
    const dataCallback = onDataCall[1] as (data: string) => void

    // Simulate Claude Code /add-dir success output
    dataCallback('Added /Users/sven/git/landingpage as a working directory for this session')

    const session = sessionManager.getSession('session-uuid-1')
    expect(session?.additionalDirs).toEqual(['/Users/sven/git/landingpage'])
  })

  it('sends agent:dirs-changed event to renderer', async () => {
    const mockWindow = createMockWindow()
    sessionManager.setMainWindow(mockWindow)

    await sessionManager.createSession({
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'test',
    })

    const onDataCall = (ptyPool.onData as ReturnType<typeof vi.fn>).mock.calls[0]
    const dataCallback = onDataCall[1] as (data: string) => void

    dataCallback('Added /tmp/mydir as a working directory for this session')

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'agent:dirs-changed',
      { sessionId: 'session-uuid-1', additionalDirs: ['/tmp/mydir'] },
    )
  })

  it('deduplicates directories', async () => {
    const mockWindow = createMockWindow()
    sessionManager.setMainWindow(mockWindow)

    await sessionManager.createSession({
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'test',
    })

    const onDataCall = (ptyPool.onData as ReturnType<typeof vi.fn>).mock.calls[0]
    const dataCallback = onDataCall[1] as (data: string) => void

    dataCallback('Added /tmp/mydir as a working directory for this session')
    dataCallback('Added /tmp/mydir as a working directory for this session')

    const session = sessionManager.getSession('session-uuid-1')
    expect(session?.additionalDirs).toEqual(['/tmp/mydir'])
  })

  it('does not run detection for shell sessions', async () => {
    const mockWindow = createMockWindow()
    sessionManager.setMainWindow(mockWindow)

    sessionManager.createShellSession('/some/cwd')

    const onDataCall = (ptyPool.onData as ReturnType<typeof vi.fn>).mock.calls[0]
    const dataCallback = onDataCall[1] as (data: string) => void

    dataCallback('Added /tmp/mydir as a working directory for this session')

    expect(mockWindow.webContents.send).not.toHaveBeenCalledWith(
      'agent:dirs-changed',
      expect.anything(),
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/session-manager.test.ts`
Expected: FAIL — `additionalDirs` not populated, `agent:dirs-changed` never sent

**Step 3: Add mock for add-dir-detector at top of test file**

Add after the existing `vi.mock('./status-detector')` block:

```typescript
vi.mock('./add-dir-detector', () => ({
  detectAddDir: vi.fn((output: string) => {
    const match = output.match(/Added\s+(.+?)\s+as a working directory/)
    return match ? match[1].replace(/\/+$/, '') : null
  }),
}))
```

**Step 4: Implement in SessionManager**

In `src/main/session-manager.ts`:

Add import at top (after line 8):
```typescript
import { detectAddDir } from './add-dir-detector'
```

Update `wireOutputStreaming` (currently lines 276-293) to add dir detection after the status detection block:

```typescript
private wireOutputStreaming(ptyId: string, session: InternalSession): void {
  this.ptyPool.onData(ptyId, (data: string) => {
    session.outputBuffer += data
    if (session.outputBuffer.length > 100_000) {
      session.outputBuffer = session.outputBuffer.slice(-50_000)
    }

    if (session.runtimeId !== '__shell__') {
      const newStatus = detectStatus(session.outputBuffer, session.runtimeId)
      if (newStatus !== session.status) {
        session.status = newStatus
        this.sendToRenderer('agent:status', { sessionId: session.id, status: newStatus })
      }

      const addedDir = detectAddDir(data)
      if (addedDir && !session.additionalDirs.includes(addedDir)) {
        session.additionalDirs.push(addedDir)
        this.sendToRenderer('agent:dirs-changed', {
          sessionId: session.id,
          additionalDirs: [...session.additionalDirs],
        })
        this.persistAdditionalDirs(session)
      }
    }

    this.sendToRenderer('agent:output', { sessionId: session.id, data })
  })
}

private persistAdditionalDirs(session: InternalSession): void {
  writeWorktreeMeta(session.worktreePath, {
    runtimeId: session.runtimeId,
    taskDescription: session.taskDescription,
    additionalDirs: session.additionalDirs,
  }).catch(() => {})
}
```

Note: `detectAddDir` is called on `data` (the new chunk), not `outputBuffer` (the full history). This avoids re-detecting directories that were already added.

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/main/session-manager.test.ts`
Expected: All tests PASS (existing + new)

**Step 6: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/main/session-manager.ts src/main/session-manager.test.ts
git commit -m "feat: wire AddDirDetector into SessionManager output stream"
```

---

### Task 4: IPC — Add `files:tree-dir` channel and update path validation

**Files:**
- Modify: `src/main/ipc/file-handlers.ts`
- Modify: `src/preload/index.ts:3-53` (ALLOWED_INVOKE_CHANNELS)
- Modify: `src/preload/index.ts:59-69` (ALLOWED_LISTEN_CHANNELS)

**Step 1: Add `files:tree-dir` handler**

In `src/main/ipc/file-handlers.ts`, add after the existing `files:tree` handler:

```typescript
ipcMain.handle('files:tree-dir', (_event, sessionId: string, dirPath: string) => {
  const session = sessionManager.getSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  if (!session.additionalDirs.includes(dirPath)) {
    throw new Error(`Directory not in session additional dirs: ${dirPath}`)
  }
  return fileWatcher.getFileTree(dirPath)
})
```

**Step 2: Extract path validation helper and update existing handlers**

In `src/main/ipc/file-handlers.ts`, replace the existing path validation in each handler. Add a helper function:

```typescript
function isPathAllowed(resolved: string, session: AgentSession): boolean {
  if (resolved.startsWith(session.worktreePath)) return true
  return session.additionalDirs.some((dir) => resolved.startsWith(dir))
}
```

Then update each handler's validation from:
```typescript
if (!resolved.startsWith(session.worktreePath)) {
  throw new Error('Path traversal denied: file outside worktree')
}
```
To:
```typescript
if (!isPathAllowed(resolved, session)) {
  throw new Error('Path traversal denied: file outside allowed directories')
}
```

Apply this to `files:read`, `files:write`, `files:delete`, and `files:rename` (both old and new path checks).

Also update the `resolve()` calls for additional dirs. Currently they resolve relative to `session.worktreePath`. For absolute paths (which added-dir files will use), `resolve()` already returns the absolute path, so this works correctly.

**Step 3: Update preload whitelist**

In `src/preload/index.ts`:

Add `'files:tree-dir'` to `ALLOWED_INVOKE_CHANNELS` (after `'files:tree'`, around line 18).

Add `'agent:dirs-changed'` to `ALLOWED_LISTEN_CHANNELS` (after `'agent:exit'`, around line 63).

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/main/ipc/file-handlers.ts src/preload/index.ts
git commit -m "feat: add files:tree-dir IPC channel and extend path validation for additional dirs"
```

---

### Task 5: FileWatcher — Watch additional directories

**Files:**
- Modify: `src/main/file-watcher.ts`
- Modify: `src/main/file-watcher.test.ts`

**Step 1: Write the failing test**

Add to `src/main/file-watcher.test.ts` (inside the existing describe block):

```typescript
describe('watchAdditionalDir', () => {
  it('starts polling an additional directory', async () => {
    const watcher = new FileWatcher(mockGitStatus)
    watcher.watchAdditionalDir('/extra/dir', 'session-1')

    // Trigger a poll cycle
    await vi.advanceTimersByTimeAsync(2000)

    // The git status function should have been called for the additional dir
    expect(mockGitStatus).toHaveBeenCalledWith('/extra/dir')
  })

  it('unwatchAll stops additional dir watchers too', async () => {
    const watcher = new FileWatcher(mockGitStatus)
    watcher.watch('/worktree', 'session-1')
    watcher.watchAdditionalDir('/extra/dir', 'session-1')

    await watcher.unwatchAll()

    await vi.advanceTimersByTimeAsync(2000)
    // No polls should fire after unwatchAll
    expect(mockGitStatus).not.toHaveBeenCalled()
  })
})
```

Note: Look at the existing test file to match the `mockGitStatus` setup pattern.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/file-watcher.test.ts`
Expected: FAIL — `watchAdditionalDir` is not a function

**Step 3: Implement `watchAdditionalDir` in FileWatcher**

In `src/main/file-watcher.ts`, add a new method:

```typescript
watchAdditionalDir(dirPath: string, sessionId: string): void {
  // Use a composite key to avoid collision with worktree paths
  const key = `additional:${sessionId}:${dirPath}`
  if (this.polls.has(key)) return

  const entry: PollEntry = {
    timer: setInterval(() => this.pollAdditionalDir(key, dirPath), POLL_INTERVAL_MS),
    sessionId,
    lastStatus: '',
    polling: false,
  }
  this.polls.set(key, entry)

  void this.pollAdditionalDir(key, dirPath)
}

private async pollAdditionalDir(key: string, dirPath: string): Promise<void> {
  const entry = this.polls.get(key)
  if (!entry || entry.polling) return

  entry.polling = true
  try {
    const status = await this.gitStatusFn(dirPath)
    if (status !== entry.lastStatus) {
      const { changes, conflicts } = parseStatusWithConflicts(status)
      entry.lastStatus = status
      this.sendToRenderer('files:changed', {
        sessionId: entry.sessionId,
        changes,
        source: dirPath,
      })
    }
  } catch {
    // Directory may not be a git repo or may not exist — skip
  } finally {
    entry.polling = false
  }
}

unwatchAdditionalDir(dirPath: string, sessionId: string): void {
  const key = `additional:${sessionId}:${dirPath}`
  const entry = this.polls.get(key)
  if (!entry) return
  clearInterval(entry.timer)
  this.polls.delete(key)
}
```

The `unwatchAll` method already iterates all `this.polls` entries, so it will clean up additional dir watchers automatically.

**Step 4: Run tests**

Run: `npx vitest run src/main/file-watcher.test.ts`
Expected: All tests PASS

**Step 5: Wire into SessionManager**

In `src/main/session-manager.ts`, update `wireOutputStreaming` where we detect an added dir. After `this.persistAdditionalDirs(session)`, add:

```typescript
// The caller (ipc-handlers or index.ts) is responsible for calling
// fileWatcher.watchAdditionalDir — SessionManager doesn't own FileWatcher.
```

Actually, SessionManager doesn't have a reference to FileWatcher. The wiring should happen in the IPC layer. Add to `src/main/ipc/agent-handlers.ts` — listen for `agent:dirs-changed` from SessionManager and start the watcher.

**Alternative (simpler):** Add `fileWatcher` as an optional dependency to `SessionManager` and call `watchAdditionalDir` directly in `wireOutputStreaming`. This avoids adding a new event bus.

In `src/main/session-manager.ts` constructor, add optional `fileWatcher` parameter:

```typescript
constructor(
  private worktreeManager: WorktreeManager,
  private ptyPool: PtyPool,
  private projectRegistry: ProjectRegistry,
  private branchCheckoutManager?: BranchCheckoutManager,
  private fileWatcher?: FileWatcher,
) {}
```

Then in the add-dir detection block:

```typescript
if (addedDir && !session.additionalDirs.includes(addedDir)) {
  session.additionalDirs.push(addedDir)
  this.sendToRenderer('agent:dirs-changed', {
    sessionId: session.id,
    additionalDirs: [...session.additionalDirs],
  })
  this.persistAdditionalDirs(session)
  this.fileWatcher?.watchAdditionalDir(addedDir, session.id)
}
```

Also update `discoverSessionsForProject` to start watchers for persisted additional dirs:

```typescript
// After creating dormant session from meta:
if (meta?.additionalDirs) {
  for (const dir of meta.additionalDirs) {
    this.fileWatcher?.watchAdditionalDir(dir, session.id)
  }
}
```

Update `src/main/index.ts` where `SessionManager` is constructed — pass `fileWatcher` as the new argument.

**Step 6: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/main/file-watcher.ts src/main/file-watcher.test.ts src/main/session-manager.ts src/main/index.ts
git commit -m "feat: add FileWatcher support for additional directories"
```

---

### Task 6: Renderer — `useAdditionalDirs` hook

**Files:**
- Create: `src/renderer/hooks/useAdditionalDirs.ts`

**Step 1: Implement the hook**

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { FileTreeNode } from '../../shared/types'

interface AdditionalDirsState {
  additionalDirs: string[]
  additionalTrees: Map<string, FileTreeNode>
}

export function useAdditionalDirs(activeSessionId: string | null): AdditionalDirsState & {
  refreshTree: (dirPath: string) => Promise<void>
} {
  const [additionalDirs, setAdditionalDirs] = useState<string[]>([])
  const [additionalTrees, setAdditionalTrees] = useState<Map<string, FileTreeNode>>(new Map())

  // Listen for agent:dirs-changed events
  useEffect(() => {
    if (!activeSessionId) {
      setAdditionalDirs([])
      setAdditionalTrees(new Map())
      return
    }

    const unsub = window.electronAPI.on('agent:dirs-changed', (payload: unknown) => {
      const { sessionId, additionalDirs: dirs } = payload as {
        sessionId: string
        additionalDirs: string[]
      }
      if (sessionId !== activeSessionId) return
      setAdditionalDirs(dirs)

      // Fetch tree for any new dirs
      for (const dir of dirs) {
        window.electronAPI.invoke('files:tree-dir', activeSessionId, dir).then((tree) => {
          setAdditionalTrees((prev) => {
            const next = new Map(prev)
            next.set(dir, tree as FileTreeNode)
            return next
          })
        }).catch(() => {
          // Directory may not exist yet
        })
      }
    })

    return unsub
  }, [activeSessionId])

  // Fetch initial trees when session changes (for persisted dirs)
  useEffect(() => {
    if (!activeSessionId) return

    // Get session to read persisted additionalDirs
    window.electronAPI.invoke('agent:sessions').then((sessions: unknown) => {
      const sessionList = sessions as Array<{ id: string; additionalDirs: string[] }>
      const session = sessionList.find((s) => s.id === activeSessionId)
      if (session?.additionalDirs?.length) {
        setAdditionalDirs(session.additionalDirs)
        for (const dir of session.additionalDirs) {
          window.electronAPI.invoke('files:tree-dir', activeSessionId, dir).then((tree) => {
            setAdditionalTrees((prev) => {
              const next = new Map(prev)
              next.set(dir, tree as FileTreeNode)
              return next
            })
          }).catch(() => {})
        }
      }
    }).catch(() => {})
  }, [activeSessionId])

  // Refresh on files:changed events
  useEffect(() => {
    if (!activeSessionId || additionalDirs.length === 0) return

    const unsub = window.electronAPI.on('files:changed', (payload: unknown) => {
      const { sessionId, source } = payload as { sessionId: string; source?: string }
      if (sessionId !== activeSessionId) return
      if (!source) return // worktree change, not additional dir

      if (additionalDirs.includes(source)) {
        window.electronAPI.invoke('files:tree-dir', activeSessionId, source).then((tree) => {
          setAdditionalTrees((prev) => {
            const next = new Map(prev)
            next.set(source, tree as FileTreeNode)
            return next
          })
        }).catch(() => {})
      }
    })

    return unsub
  }, [activeSessionId, additionalDirs])

  const refreshTree = useCallback(async (dirPath: string) => {
    if (!activeSessionId) return
    try {
      const tree = await window.electronAPI.invoke('files:tree-dir', activeSessionId, dirPath)
      setAdditionalTrees((prev) => {
        const next = new Map(prev)
        next.set(dirPath, tree as FileTreeNode)
        return next
      })
    } catch {
      // ignore
    }
  }, [activeSessionId])

  return { additionalDirs, additionalTrees, refreshTree }
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/hooks/useAdditionalDirs.ts
git commit -m "feat: add useAdditionalDirs hook for renderer"
```

---

### Task 7: Renderer — Sidebar shows added dirs under AgentItem

**Files:**
- Modify: `src/renderer/components/AgentItem.tsx`

**Step 1: Add additionalDirs prop and render dir labels**

Update `AgentItemProps` to accept `additionalDirs`:

```typescript
interface AgentItemProps {
  session: AgentSession
  isActive: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}
```

The `additionalDirs` come from `session.additionalDirs` directly (since it's now on `AgentSession`). No new prop needed.

Add the directory list after the `secondaryLabel` span, inside the button:

```tsx
{session.additionalDirs.length > 0 && (
  <div style={{ paddingLeft: '14px', paddingTop: '2px' }}>
    {session.additionalDirs.map((dir) => {
      const dirName = dir.split('/').filter(Boolean).pop() ?? dir
      return (
        <div
          key={dir}
          title={dir}
          style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            opacity: 0.7,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            paddingTop: '1px',
          }}
          className="truncate"
        >
          <span style={{ fontSize: '9px' }}>&#128193;</span>
          {dirName}
        </div>
      )
    })}
  </div>
)}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/components/AgentItem.tsx
git commit -m "feat: show additional dirs in sidebar under agent item"
```

---

### Task 8: Renderer — Multi-root file tree

**Files:**
- Modify: `src/renderer/components/FileTree.tsx`

**Step 1: Add `additionalTrees` prop**

Update `FileTreeProps`:

```typescript
interface FileTreeProps {
  tree: FileTreeNode | null
  additionalTrees?: Map<string, FileTreeNode>
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

**Step 2: Render multi-root workspace**

Replace the single `TreeNode` rendering with a multi-root layout. When `additionalTrees` has entries, render workspace-style headers:

```tsx
{tree ? (
  <>
    {additionalTrees && additionalTrees.size > 0 ? (
      <>
        <WorkspaceRootHeader name={tree.name} />
        <TreeNode node={tree} depth={0} /* ...existing props... */ />
        {Array.from(additionalTrees.entries()).map(([dirPath, dirTree]) => (
          <React.Fragment key={dirPath}>
            <WorkspaceRootHeader name={dirTree.name} />
            <TreeNode node={dirTree} depth={0} /* ...same props... */ />
          </React.Fragment>
        ))}
      </>
    ) : (
      <TreeNode node={tree} depth={0} /* ...existing props... */ />
    )}
  </>
) : (
  <div style={treeStyles.empty}>No files to display</div>
)}
```

Add the `WorkspaceRootHeader` component:

```tsx
function WorkspaceRootHeader({ name }: { name: string }): React.JSX.Element {
  return (
    <div
      style={{
        padding: '6px 8px 4px',
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        color: 'var(--text-secondary)',
        letterSpacing: '0.05em',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {name}
    </div>
  )
}
```

**Step 3: Update changeMap to include additional dir changes**

The `changeMap` useMemo needs to resolve paths for all roots, not just the primary tree root. Update it to also map changes for additional trees. Since `files:changed` events now include a `source` field for additional dirs, you may need to merge changes from multiple sources. For now, the existing changeMap works because it resolves paths against the root — each `TreeNode` renders with its own root path.

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/FileTree.tsx
git commit -m "feat: render multi-root workspace in file tree"
```

---

### Task 9: Wire everything together in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx` (or wherever FileTree and hooks are composed)

**Step 1: Import and use `useAdditionalDirs`**

Find where `FileTree` is rendered (likely in `App.tsx` or a pane component). Add:

```typescript
const { additionalDirs, additionalTrees } = useAdditionalDirs(activeSessionId)
```

Pass `additionalTrees` to `FileTree`:

```tsx
<FileTree
  tree={tree}
  additionalTrees={additionalTrees}
  changes={changes}
  /* ...rest of existing props... */
/>
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/renderer/App.tsx src/renderer/hooks/useAdditionalDirs.ts
git commit -m "feat: wire useAdditionalDirs into App and FileTree"
```

---

### Task 10: Manual Integration Test

**Step 1: Start the app in dev mode**

Run: `npm run dev`

**Step 2: Test the flow**

1. Create a new agent session with Claude Code
2. In the agent terminal, type `/add-dir /path/to/some/directory`
3. Select option 1 ("Yes, for this session")
4. Verify:
   - The directory appears in the sidebar under the agent
   - The file tree shows a second root with the directory name
   - Files in the added directory can be clicked and viewed in the code editor
   - Files can be edited and saved
5. Kill and restart the app
6. Verify the added directory is still shown (persistence)

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for add-dir workspace feature"
```
