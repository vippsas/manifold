# Modified Files Pane Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a resizable "Modified Files" pane between the file tree and shell tabs that lists git-changed files and opens them in the editor on click.

**Architecture:** New `ModifiedFiles` component receives `FileChange[]` from the existing `useFileWatcher` hook. It sits inside the right pane column, below the file tree, with a new horizontal divider managed by `usePaneResize`. No new IPC channels — all data already flows through existing hooks.

**Tech Stack:** React, TypeScript, Electron IPC (existing), Vitest

**Design doc:** `docs/plans/2026-02-21-modified-files-pane-design.md`

---

### Task 1: Create ModifiedFiles Component Test

**Files:**
- Create: `src/renderer/components/ModifiedFiles.test.tsx`

**Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModifiedFiles } from './ModifiedFiles'
import type { FileChange } from '../../shared/types'

describe('ModifiedFiles', () => {
  const mockOnSelectFile = vi.fn()
  const worktreeRoot = '/workspace/project'

  const sampleChanges: FileChange[] = [
    { path: 'src/index.ts', type: 'modified' },
    { path: 'src/utils/helpers.ts', type: 'added' },
    { path: 'old-file.ts', type: 'deleted' },
  ]

  it('renders header with file count', () => {
    render(
      <ModifiedFiles
        changes={sampleChanges}
        activeFilePath={null}
        worktreeRoot={worktreeRoot}
        onSelectFile={mockOnSelectFile}
      />
    )
    expect(screen.getByText('Modified Files')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('renders each changed file', () => {
    render(
      <ModifiedFiles
        changes={sampleChanges}
        activeFilePath={null}
        worktreeRoot={worktreeRoot}
        onSelectFile={mockOnSelectFile}
      />
    )
    expect(screen.getByText('index.ts')).toBeTruthy()
    expect(screen.getByText('helpers.ts')).toBeTruthy()
    expect(screen.getByText('old-file.ts')).toBeTruthy()
  })

  it('calls onSelectFile with absolute path on click', () => {
    render(
      <ModifiedFiles
        changes={sampleChanges}
        activeFilePath={null}
        worktreeRoot={worktreeRoot}
        onSelectFile={mockOnSelectFile}
      />
    )
    fireEvent.click(screen.getByText('index.ts'))
    expect(mockOnSelectFile).toHaveBeenCalledWith('/workspace/project/src/index.ts')
  })

  it('highlights the active file', () => {
    render(
      <ModifiedFiles
        changes={sampleChanges}
        activeFilePath="/workspace/project/src/index.ts"
        worktreeRoot={worktreeRoot}
        onSelectFile={mockOnSelectFile}
      />
    )
    const row = screen.getByText('index.ts').closest('[role="button"]')
    expect(row?.getAttribute('data-active')).toBe('true')
  })

  it('shows empty state when no changes', () => {
    render(
      <ModifiedFiles
        changes={[]}
        activeFilePath={null}
        worktreeRoot={worktreeRoot}
        onSelectFile={mockOnSelectFile}
      />
    )
    expect(screen.getByText('No changes')).toBeTruthy()
  })

  it('sorts by type: modified first, then added, then deleted', () => {
    const mixed: FileChange[] = [
      { path: 'z-deleted.ts', type: 'deleted' },
      { path: 'a-added.ts', type: 'added' },
      { path: 'm-modified.ts', type: 'modified' },
    ]
    render(
      <ModifiedFiles
        changes={mixed}
        activeFilePath={null}
        worktreeRoot={worktreeRoot}
        onSelectFile={mockOnSelectFile}
      />
    )
    const rows = screen.getAllByRole('button')
    expect(rows[0].textContent).toContain('m-modified.ts')
    expect(rows[1].textContent).toContain('a-added.ts')
    expect(rows[2].textContent).toContain('z-deleted.ts')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/ModifiedFiles.test.tsx`
Expected: FAIL — module `./ModifiedFiles` not found

---

### Task 2: Create ModifiedFiles Component

**Files:**
- Create: `src/renderer/components/ModifiedFiles.tsx`

**Step 1: Write minimal implementation to pass tests**

```tsx
import React, { useMemo, useCallback } from 'react'
import type { FileChange, FileChangeType } from '../../shared/types'

interface ModifiedFilesProps {
  changes: FileChange[]
  activeFilePath: string | null
  worktreeRoot: string
  onSelectFile: (absolutePath: string) => void
}

const TYPE_ORDER: FileChangeType[] = ['modified', 'added', 'deleted']

const CHANGE_INDICATORS: Record<FileChangeType, { color: string; label: string }> = {
  modified: { color: 'var(--warning)', label: 'M' },
  added: { color: 'var(--success)', label: 'A' },
  deleted: { color: 'var(--error)', label: 'D' },
}

export function ModifiedFiles({
  changes,
  activeFilePath,
  worktreeRoot,
  onSelectFile,
}: ModifiedFilesProps): React.JSX.Element {
  const root = worktreeRoot.replace(/\/$/, '')

  const sorted = useMemo(() => {
    return [...changes].sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type)
      const bi = TYPE_ORDER.indexOf(b.type)
      if (ai !== bi) return ai - bi
      return a.path.localeCompare(b.path)
    })
  }, [changes])

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Modified Files</span>
        {changes.length > 0 && <span style={styles.badge}>{changes.length}</span>}
      </div>
      <div style={styles.list}>
        {sorted.length === 0 ? (
          <div style={styles.empty}>No changes</div>
        ) : (
          sorted.map((change) => (
            <ModifiedFileRow
              key={change.path}
              change={change}
              isActive={activeFilePath === `${root}/${change.path}`}
              onSelect={() => onSelectFile(`${root}/${change.path}`)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ModifiedFileRow({
  change,
  isActive,
  onSelect,
}: {
  change: FileChange
  isActive: boolean
  onSelect: () => void
}): React.JSX.Element {
  const parts = change.path.split('/')
  const filename = parts[parts.length - 1]
  const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  const indicator = CHANGE_INDICATORS[change.type]

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      data-active={isActive || undefined}
      style={{
        ...styles.row,
        ...(isActive ? styles.rowActive : undefined),
      }}
      title={change.path}
    >
      <span style={{ ...styles.indicator, color: indicator.color }}>{'\u25CF'}</span>
      <div style={styles.fileInfo}>
        <span className="truncate" style={styles.filename}>{filename}</span>
        {dir && <span className="truncate" style={styles.dir}>{dir}</span>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  badge: {
    fontSize: '10px',
    color: 'var(--accent)',
    padding: '1px 6px',
    borderRadius: '8px',
    background: 'rgba(79, 195, 247, 0.12)',
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    cursor: 'pointer',
    fontSize: '12px',
    lineHeight: '18px',
    color: 'var(--text-primary)',
  },
  rowActive: {
    background: 'rgba(79, 195, 247, 0.12)',
    color: 'var(--accent)',
  },
  indicator: {
    flexShrink: 0,
    fontSize: '8px',
  },
  fileInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
    flex: 1,
  },
  filename: {
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
  },
  dir: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run src/renderer/components/ModifiedFiles.test.tsx`
Expected: All 6 tests PASS

**Step 3: Commit**

```bash
git add src/renderer/components/ModifiedFiles.tsx src/renderer/components/ModifiedFiles.test.tsx
git commit -m "feat: add ModifiedFiles component with tests"
```

---

### Task 3: Add File-Tree-Split Resize to usePaneResize

**Files:**
- Modify: `src/renderer/hooks/usePaneResize.ts`

**Step 1: Add `fileTreeSplit` divider type and fraction**

In `src/renderer/hooks/usePaneResize.ts`:

1. Extend `DividerType` at line 3:
```ts
type DividerType = 'left' | 'right' | 'bottom' | 'fileTreeSplit'
```

2. Add state for the split fraction (after line 34):
```ts
const [fileTreeSplitFraction, setFileTreeSplitFraction] = useState(0.4)
```
This is the fraction of the right pane taken by modified files (bottom portion). So file tree gets `1 - 0.4 = 60%`.

3. Add a ref for the right pane element (after line 44):
```ts
const rightPaneRef = useRef<HTMLDivElement>(null)
```

4. Add mouse-move handler for `fileTreeSplit` in the `handleMouseMove` function (after the `bottom` handler block, around line 68):
```ts
if (draggingRef.current === 'fileTreeSplit') {
  if (!rightPaneRef.current) return
  const rect = rightPaneRef.current.getBoundingClientRect()
  const y = e.clientY - rect.top
  const fraction = 1 - y / rect.height
  const clamped = Math.max(0.2, Math.min(0.8, fraction))
  setFileTreeSplitFraction(clamped)
  return
}
```

5. Add `fileTreeSplitFraction` to the return object, and `rightPaneRef`:
```ts
return {
  leftPaneFraction,
  rightPaneFraction,
  centerFraction,
  bottomPaneFraction,
  fileTreeSplitFraction,
  panesRef,
  rightAreaRef,
  rightPaneRef,
  handleDividerMouseDown,
  paneVisibility,
  togglePane,
}
```

6. Update `PaneResizeResult` interface to include the new fields:
```ts
interface PaneResizeResult {
  leftPaneFraction: number
  rightPaneFraction: number
  centerFraction: number
  bottomPaneFraction: number
  fileTreeSplitFraction: number
  panesRef: RefObject<HTMLDivElement>
  rightAreaRef: RefObject<HTMLDivElement>
  rightPaneRef: RefObject<HTMLDivElement>
  handleDividerMouseDown: (divider: DividerType) => (e: React.MouseEvent) => void
  paneVisibility: PaneVisibility
  togglePane: (pane: PaneName) => void
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: Pass (or only errors from not-yet-updated consumers)

**Step 3: Commit**

```bash
git add src/renderer/hooks/usePaneResize.ts
git commit -m "feat: add fileTreeSplit resize state to usePaneResize"
```

---

### Task 4: Wire ModifiedFiles into MainPanes Layout

**Files:**
- Modify: `src/renderer/components/MainPanes.tsx`

**Step 1: Update MainPanesProps interface**

Add these new props to `MainPanesProps` (around line 12):
```ts
fileTreeSplitFraction: number
rightPaneRef: RefObject<HTMLDivElement>
worktreeRoot: string | null
```

**Step 2: Import ModifiedFiles**

Add import at top (around line 9):
```ts
import { ModifiedFiles } from './ModifiedFiles'
```

**Step 3: Replace the right pane div with a vertical split**

Replace the right pane section (lines 150-161) — the `<div className="layout-pane">` that wraps `<FileTree>` — with a vertical flexbox containing FileTree, a horizontal divider, and ModifiedFiles:

```tsx
<div
  ref={rightPaneRef}
  className="layout-pane"
  style={{
    flex: showCenter ? `0 0 ${rightAreaRightFraction * 100}%` : 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }}
>
  {/* File Tree (top portion) */}
  <div style={{ flex: `0 0 ${(1 - fileTreeSplitFraction) * 100}%`, overflow: 'hidden', minHeight: 0 }}>
    <FileTree
      tree={tree}
      changes={changes}
      activeFilePath={activeFilePath}
      expandedPaths={expandedPaths}
      onToggleExpand={onToggleExpand}
      onSelectFile={onSelectFile}
      onShowDiff={onShowDiff}
      onClose={() => onClosePane('right')}
    />
  </div>

  {/* Divider between File Tree and Modified Files */}
  <div
    className="pane-divider-horizontal"
    onMouseDown={handleDividerMouseDown('fileTreeSplit')}
    role="separator"
    aria-orientation="horizontal"
  />

  {/* Modified Files (bottom portion) */}
  <div style={{ flex: `0 0 ${fileTreeSplitFraction * 100}%`, overflow: 'hidden', minHeight: 0 }}>
    <ModifiedFiles
      changes={changes}
      activeFilePath={activeFilePath}
      worktreeRoot={worktreeRoot ?? ''}
      onSelectFile={onSelectFile}
    />
  </div>
</div>
```

**Step 4: Destructure the new props** in the function signature (add to the destructuring around line 76):
```ts
fileTreeSplitFraction,
rightPaneRef,
worktreeRoot,
```

**Step 5: Commit**

```bash
git add src/renderer/components/MainPanes.tsx
git commit -m "feat: add ModifiedFiles pane to MainPanes layout"
```

---

### Task 5: Pass Data Through from App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: Pass new props to MainPanes**

In `App.tsx` around line 298-329, add the three new props to the `<MainPanes>` JSX:

```tsx
<MainPanes
  // ... existing props ...
  fileTreeSplitFraction={paneResize.fileTreeSplitFraction}
  rightPaneRef={paneResize.rightPaneRef}
  worktreeRoot={tree?.path ?? null}
/>
```

The `tree?.path` is already available — it's the root of the `FileTreeNode` from `useFileWatcher`, which is the worktree's absolute path.

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass including the new ModifiedFiles tests

**Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: wire ModifiedFiles pane data through App"
```

---

### Task 6: Visual Verification and Final Typecheck

**Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS with zero errors

**Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Manual verification**

Run: `npm run dev`

Verify:
- Modified Files pane appears below File Tree in the right column
- Dragging the divider between File Tree and Modified Files resizes both
- Changed files show with colored dots (yellow M, green A, red D)
- Clicking a changed file opens it in the editor
- Active file is highlighted
- Empty state shows "No changes" when no files are modified
- Header shows file count badge

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: modified files pane — visual polish and integration"
```
