# Bottom Terminal Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an independent user terminal panel beneath the code editor and file tree panels, while the agent terminal on the left stays full-height.

**Architecture:** Nest a vertical flex container inside the right portion of MainPanes. The top holds the existing editor + file tree, the bottom holds a new TerminalPane with its own PTY. A draggable horizontal divider separates them. The backend gets a lightweight `createShellSession` method that spawns a plain shell (no agent runtime).

**Tech Stack:** React, xterm.js, node-pty, Electron IPC

---

### Task 1: Backend — Add `createShellSession` to SessionManager

**Files:**
- Modify: `src/main/session-manager.ts:15-17` (add shell sessions map + method)
- Test: `src/main/session-manager.test.ts`

**Step 1: Write the failing test**

Add to `src/main/session-manager.test.ts` at the end of the describe block:

```typescript
describe('createShellSession', () => {
  it('spawns a shell pty and returns a session id', () => {
    const mockWindow = createMockWindow()
    sessionManager.setMainWindow(mockWindow)

    const shellSession = sessionManager.createShellSession('/some/cwd')

    expect(shellSession).toEqual({ sessionId: 'session-uuid-1' })
    expect(ptyPool.spawn).toHaveBeenCalledWith(
      process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/zsh',
      [],
      expect.objectContaining({ cwd: '/some/cwd' }),
    )
    expect(ptyPool.onData).toHaveBeenCalledWith('pty-1', expect.any(Function))
    expect(ptyPool.onExit).toHaveBeenCalledWith('pty-1', expect.any(Function))
  })

  it('streams output to renderer via agent:output', () => {
    const mockWindow = createMockWindow()
    sessionManager.setMainWindow(mockWindow)

    sessionManager.createShellSession('/some/cwd')

    const onDataCall = (ptyPool.onData as ReturnType<typeof vi.fn>).mock.calls[0]
    const dataCallback = onDataCall[1] as (data: string) => void
    dataCallback('shell output')

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'agent:output',
      { sessionId: 'session-uuid-1', data: 'shell output' },
    )
  })

  it('supports sendInput on shell sessions', () => {
    sessionManager.createShellSession('/some/cwd')

    sessionManager.sendInput('session-uuid-1', 'ls\n')
    expect(ptyPool.write).toHaveBeenCalledWith('pty-1', 'ls\n')
  })

  it('supports resize on shell sessions', () => {
    sessionManager.createShellSession('/some/cwd')

    sessionManager.resize('session-uuid-1', 120, 40)
    expect(ptyPool.resize).toHaveBeenCalledWith('pty-1', 120, 40)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/session-manager.test.ts`
Expected: FAIL — `sessionManager.createShellSession is not a function`

**Step 3: Write minimal implementation**

Add to `src/main/session-manager.ts` after the `killAllSessions` method (around line 147):

```typescript
createShellSession(cwd: string): { sessionId: string } {
  const shell = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/zsh')
  const ptyHandle = this.ptyPool.spawn(shell, [], { cwd })
  const id = uuidv4()

  const session: InternalSession = {
    id,
    projectId: '',
    runtimeId: '__shell__',
    branchName: '',
    worktreePath: cwd,
    status: 'running',
    pid: ptyHandle.pid,
    ptyId: ptyHandle.id,
    outputBuffer: '',
  }

  this.sessions.set(id, session)
  this.wireOutputStreaming(ptyHandle.id, session)
  this.wireExitHandling(ptyHandle.id, session)

  return { sessionId: id }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/session-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/session-manager.ts src/main/session-manager.test.ts
git commit -m "feat: add createShellSession to SessionManager for independent shell PTY"
```

---

### Task 2: IPC + Preload — Register `shell:create` handler

**Files:**
- Modify: `src/main/ipc-handlers.ts:25-33` (register new handler)
- Modify: `src/preload/index.ts:3-21` (add `shell:create` to allowed channels)

**Step 1: Add the IPC handler**

In `src/main/ipc-handlers.ts`, inside `registerAgentHandlers`, add after the `agent:sessions` handler (around line 107):

```typescript
ipcMain.handle('shell:create', (_event, cwd: string) => {
  return sessionManager.createShellSession(cwd)
})
```

**Step 2: Add `shell:create` to the preload allowlist**

In `src/preload/index.ts`, add `'shell:create'` to the `ALLOWED_INVOKE_CHANNELS` array (after line 20):

```typescript
const ALLOWED_INVOKE_CHANNELS = [
  // ... existing channels ...
  'branch:suggest',
  'shell:create',   // <-- add this
] as const
```

**Step 3: Run all tests to verify nothing breaks**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/main/ipc-handlers.ts src/preload/index.ts
git commit -m "feat: register shell:create IPC handler and preload allowlist entry"
```

---

### Task 3: Hook — Add `useShellSession` to auto-create shell on mount

**Files:**
- Create: `src/renderer/hooks/useShellSession.ts`

**Step 1: Create the hook**

```typescript
import { useState, useEffect } from 'react'

export function useShellSession(cwd: string | null): string | null {
  const [shellSessionId, setShellSessionId] = useState<string | null>(null)

  useEffect(() => {
    if (!cwd) return

    let cancelled = false

    void (async () => {
      const result = (await window.electronAPI.invoke('shell:create', cwd)) as { sessionId: string }
      if (!cancelled) {
        setShellSessionId(result.sessionId)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [cwd])

  return shellSessionId
}
```

**Step 2: Commit**

```bash
git add src/renderer/hooks/useShellSession.ts
git commit -m "feat: add useShellSession hook for bottom terminal PTY lifecycle"
```

---

### Task 4: CSS — Add horizontal divider style

**Files:**
- Modify: `src/renderer/styles/theme.css:202-225`

**Step 1: Add `.pane-divider-horizontal` class**

After the `.pane-divider::after` block (line 225), add:

```css
/* ─── Horizontal Pane Divider ─── */
.pane-divider-horizontal {
  height: var(--pane-divider-width);
  min-height: var(--pane-divider-width);
  background: var(--divider);
  cursor: row-resize;
  position: relative;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.pane-divider-horizontal:hover,
.pane-divider-horizontal.dragging {
  background: var(--accent);
}

.pane-divider-horizontal::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: -4px;
  bottom: -4px;
}
```

**Step 2: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "feat: add horizontal pane divider CSS for bottom terminal split"
```

---

### Task 5: Resize hook — Add vertical (bottom) split support to `usePaneResize`

**Files:**
- Modify: `src/renderer/hooks/usePaneResize.ts`

**Step 1: Add `bottomPaneFraction` state and horizontal drag**

Replace the full file content with:

```typescript
import { useState, useEffect, useCallback, useRef, type RefObject } from 'react'

type DividerType = 'left' | 'right' | 'bottom'

interface PaneResizeResult {
  leftPaneFraction: number
  rightPaneFraction: number
  centerFraction: number
  bottomPaneFraction: number
  panesRef: RefObject<HTMLDivElement>
  rightAreaRef: RefObject<HTMLDivElement>
  handleDividerMouseDown: (divider: DividerType) => (e: React.MouseEvent) => void
}

export function usePaneResize(
  initialLeft: number = 0.35,
  initialRight: number = 0.22,
  initialBottom: number = 0.30
): PaneResizeResult {
  const [leftPaneFraction, setLeftPaneFraction] = useState(initialLeft)
  const [rightPaneFraction, setRightPaneFraction] = useState(initialRight)
  const [bottomPaneFraction, setBottomPaneFraction] = useState(initialBottom)
  const panesRef = useRef<HTMLDivElement>(null)
  const rightAreaRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<DividerType | null>(null)

  const handleDividerMouseDown = useCallback(
    (divider: DividerType) => (_e: React.MouseEvent): void => {
      draggingRef.current = divider
      document.body.style.cursor = divider === 'bottom' ? 'row-resize' : 'col-resize'
      document.body.style.userSelect = 'none'
    },
    []
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return

      if (draggingRef.current === 'bottom') {
        if (!rightAreaRef.current) return
        const rect = rightAreaRef.current.getBoundingClientRect()
        const y = e.clientY - rect.top
        const fraction = 1 - y / rect.height
        const clamped = Math.max(0.2, Math.min(0.8, fraction))
        setBottomPaneFraction(clamped)
        return
      }

      if (!panesRef.current) return
      const rect = panesRef.current.getBoundingClientRect()
      const totalWidth = rect.width
      const x = e.clientX - rect.left
      const fraction = x / totalWidth

      if (draggingRef.current === 'left') {
        const clamped = Math.max(0.15, Math.min(0.6, fraction))
        setLeftPaneFraction(clamped)
      } else {
        const rightFrac = 1 - fraction
        const clamped = Math.max(0.1, Math.min(0.4, rightFrac))
        setRightPaneFraction(clamped)
      }
    }

    const handleMouseUp = (): void => {
      draggingRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const centerFraction = 1 - leftPaneFraction - rightPaneFraction

  return {
    leftPaneFraction,
    rightPaneFraction,
    centerFraction,
    bottomPaneFraction,
    panesRef,
    rightAreaRef,
    handleDividerMouseDown,
  }
}
```

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/renderer/hooks/usePaneResize.ts
git commit -m "feat: add bottom pane fraction and horizontal drag to usePaneResize"
```

---

### Task 6: Layout — Update `MainPanes` and `App` to render bottom terminal

**Files:**
- Modify: `src/renderer/components/MainPanes.tsx`
- Modify: `src/renderer/App.tsx`

**Step 1: Update MainPanes to accept and render the bottom terminal**

Replace `src/renderer/components/MainPanes.tsx` with:

```typescript
import React, { type RefObject } from 'react'
import type { FileTreeNode, FileChange } from '../../shared/types'
import type { OpenFile } from '../hooks/useCodeView'
import { TerminalPane } from './TerminalPane'
import { CodeViewer } from './CodeViewer'
import { FileTree } from './FileTree'

interface MainPanesProps {
  panesRef: RefObject<HTMLDivElement>
  rightAreaRef: RefObject<HTMLDivElement>
  leftPaneFraction: number
  centerFraction: number
  rightPaneFraction: number
  bottomPaneFraction: number
  handleDividerMouseDown: (divider: 'left' | 'right' | 'bottom') => (e: React.MouseEvent) => void
  sessionId: string | null
  shellSessionId: string | null
  scrollbackLines: number
  codeViewMode: 'diff' | 'file'
  diff: string
  openFiles: OpenFile[]
  activeFilePath: string | null
  fileContent: string | null
  theme: 'dark' | 'light'
  tree: FileTreeNode | null
  changes: FileChange[]
  onSelectFile: (path: string) => void
  onCloseFile: (path: string) => void
  onShowDiff: () => void
  onSaveFile: (content: string) => void
}

export function MainPanes({
  panesRef,
  rightAreaRef,
  leftPaneFraction,
  centerFraction,
  rightPaneFraction,
  bottomPaneFraction,
  handleDividerMouseDown,
  sessionId,
  shellSessionId,
  scrollbackLines,
  codeViewMode,
  diff,
  openFiles,
  activeFilePath,
  fileContent,
  theme,
  tree,
  changes,
  onSelectFile,
  onCloseFile,
  onShowDiff,
  onSaveFile,
}: MainPanesProps): React.JSX.Element {
  // Within the right area, compute relative fractions for center vs right pane.
  // The left pane uses an absolute fraction of the total; center and right share the remainder.
  const rightAreaCenterFraction = centerFraction / (centerFraction + rightPaneFraction)
  const rightAreaRightFraction = rightPaneFraction / (centerFraction + rightPaneFraction)
  const topFraction = 1 - bottomPaneFraction

  return (
    <div className="layout-panes" ref={panesRef}>
      {/* Left Pane — Agent Terminal (full height) */}
      <div className="layout-pane" style={{ flex: `0 0 ${leftPaneFraction * 100}%` }}>
        <TerminalPane sessionId={sessionId} scrollbackLines={scrollbackLines} />
      </div>

      <div
        className="pane-divider"
        onMouseDown={handleDividerMouseDown('left')}
        role="separator"
        aria-orientation="vertical"
      />

      {/* Right Area — vertical split: top (editor + files) / bottom (user terminal) */}
      <div
        ref={rightAreaRef}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}
      >
        {/* Top: editor + file tree */}
        <div style={{ flex: `0 0 ${topFraction * 100}%`, display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0 }}>
          <div className="layout-pane" style={{ flex: `0 0 ${rightAreaCenterFraction * 100}%` }}>
            <CodeViewer
              mode={codeViewMode}
              diff={diff}
              openFiles={openFiles}
              activeFilePath={activeFilePath}
              fileContent={fileContent}
              theme={theme}
              onSelectTab={onSelectFile}
              onCloseTab={onCloseFile}
              onShowDiff={onShowDiff}
              onSaveFile={onSaveFile}
            />
          </div>

          <div
            className="pane-divider"
            onMouseDown={handleDividerMouseDown('right')}
            role="separator"
            aria-orientation="vertical"
          />

          <div className="layout-pane" style={{ flex: `0 0 ${rightAreaRightFraction * 100}%` }}>
            <FileTree
              tree={tree}
              changes={changes}
              onSelectFile={onSelectFile}
              onShowDiff={onShowDiff}
            />
          </div>
        </div>

        {/* Horizontal Divider */}
        <div
          className="pane-divider-horizontal"
          onMouseDown={handleDividerMouseDown('bottom')}
          role="separator"
          aria-orientation="horizontal"
        />

        {/* Bottom: User Terminal */}
        <div style={{ flex: `0 0 ${bottomPaneFraction * 100}%`, overflow: 'hidden', minHeight: 0 }}>
          <TerminalPane sessionId={shellSessionId} scrollbackLines={scrollbackLines} />
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Update App.tsx to wire everything together**

In `src/renderer/App.tsx`:

1. Add import for `useShellSession`:
```typescript
import { useShellSession } from './hooks/useShellSession'
```

2. After the `codeView` hook (line 25), add:
```typescript
const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
const shellSessionId = useShellSession(activeProject?.path ?? null)
```

3. Remove the duplicate `activeProject` declaration on line 45.

4. Update `<MainPanes>` props to include the new ones:
```typescript
<MainPanes
  panesRef={paneResize.panesRef}
  rightAreaRef={paneResize.rightAreaRef}
  leftPaneFraction={paneResize.leftPaneFraction}
  centerFraction={paneResize.centerFraction}
  rightPaneFraction={paneResize.rightPaneFraction}
  bottomPaneFraction={paneResize.bottomPaneFraction}
  handleDividerMouseDown={paneResize.handleDividerMouseDown}
  sessionId={activeSessionId}
  shellSessionId={shellSessionId}
  scrollbackLines={settings.scrollbackLines}
  // ... rest unchanged
/>
```

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/renderer/components/MainPanes.tsx src/renderer/App.tsx
git commit -m "feat: render bottom terminal panel in MainPanes layout with vertical split"
```

---

### Task 7: TerminalPane header — Differentiate agent vs user terminal labels

**Files:**
- Modify: `src/renderer/components/TerminalPane.tsx`

**Step 1: Add optional `label` prop**

```typescript
interface TerminalPaneProps {
  sessionId: string | null
  scrollbackLines: number
  label?: string
}

export function TerminalPane({
  sessionId,
  scrollbackLines,
  label = 'Terminal',
}: TerminalPaneProps): React.JSX.Element {
  const { containerRef } = useTerminal({ sessionId, scrollbackLines })

  return (
    <div style={paneStyles.wrapper}>
      <div style={paneStyles.header}>
        <span className="mono" style={paneStyles.headerText}>
          {label}
        </span>
      </div>
      <div ref={containerRef as React.RefCallback<HTMLDivElement> | React.RefObject<HTMLDivElement> | null} style={paneStyles.container} />
    </div>
  )
}
```

**Step 2: Pass labels from MainPanes**

In `MainPanes.tsx`, update the two TerminalPane usages:
- Agent terminal: `<TerminalPane sessionId={sessionId} scrollbackLines={scrollbackLines} label="Agent" />`
- User terminal: `<TerminalPane sessionId={shellSessionId} scrollbackLines={scrollbackLines} label="Shell" />`

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/renderer/components/TerminalPane.tsx src/renderer/components/MainPanes.tsx
git commit -m "feat: add label prop to TerminalPane for Agent vs Shell distinction"
```

---

### Task 8: Manual smoke test

**Step 1: Build and run the app**

Run: `npm run dev` (or the project's dev command)

**Step 2: Verify layout**

- Agent terminal on the left should be full-height
- Code editor and file tree should be in the top-right
- User shell terminal should be in the bottom-right
- Horizontal divider between top and bottom should be draggable
- Vertical dividers should still work as before

**Step 3: Verify shell independence**

- Type `ls` in the bottom terminal — should execute independently
- Agent terminal on the left should be unaffected

**Step 4: Verify resize**

- Drag the horizontal divider up and down — both sections should resize
- Drag the vertical dividers — should still work correctly
- All three terminals should re-fit their xterm instances on resize
