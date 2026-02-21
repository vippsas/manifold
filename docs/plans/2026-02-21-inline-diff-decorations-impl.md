# Inline Diff Decorations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the "Changes" tab with inline Monaco editor decorations that show git diff gutter markers on modified files.

**Architecture:** The diff string from `useDiff` is parsed per-file into line ranges (added/modified/deleted). When a modified file is opened in the editor, Monaco's `deltaDecorations` API applies colored gutter bars and line background highlights. The `DiffEditor` component and all diff-view-mode machinery are removed.

**Tech Stack:** React, Monaco Editor (`deltaDecorations` API), TypeScript

---

### Task 1: Add `parseDiffToLineRanges` utility with tests

**Files:**
- Modify: `src/renderer/components/code-viewer-utils.ts`
- Create: `src/renderer/components/code-viewer-utils.test.ts`

**Step 1: Write the test file**

```typescript
// src/renderer/components/code-viewer-utils.test.ts
import { describe, it, expect } from 'vitest'
import { parseDiffToLineRanges, splitDiffByFile } from './code-viewer-utils'

describe('parseDiffToLineRanges', () => {
  it('returns empty ranges for empty diff', () => {
    expect(parseDiffToLineRanges('')).toEqual({ added: [], modified: [], deleted: [] })
  })

  it('detects added lines', () => {
    const diff = [
      'diff --git a/foo.ts b/foo.ts',
      'index abc..def 100644',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,3 +1,5 @@',
      ' line1',
      ' line2',
      '+newline3',
      '+newline4',
      ' line3',
    ].join('\n')
    const result = parseDiffToLineRanges(diff)
    // Added at lines 3-4 in the modified file
    expect(result.added).toEqual([{ startLine: 3, endLine: 4 }])
    expect(result.modified).toEqual([])
    expect(result.deleted).toEqual([])
  })

  it('detects modified lines (adjacent remove + add)', () => {
    const diff = [
      'diff --git a/foo.ts b/foo.ts',
      'index abc..def 100644',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-old line2',
      '+new line2',
      ' line3',
    ].join('\n')
    const result = parseDiffToLineRanges(diff)
    expect(result.added).toEqual([])
    expect(result.modified).toEqual([{ startLine: 2, endLine: 2 }])
    expect(result.deleted).toEqual([])
  })

  it('detects deleted lines', () => {
    const diff = [
      'diff --git a/foo.ts b/foo.ts',
      'index abc..def 100644',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,4 +1,3 @@',
      ' line1',
      '-removed',
      ' line2',
      ' line3',
    ].join('\n')
    const result = parseDiffToLineRanges(diff)
    expect(result.added).toEqual([])
    expect(result.modified).toEqual([])
    // Deleted after line 1 in the modified file
    expect(result.deleted).toEqual([1])
  })

  it('handles multiple hunks', () => {
    const diff = [
      'diff --git a/foo.ts b/foo.ts',
      'index abc..def 100644',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,3 +1,4 @@',
      ' line1',
      '+added',
      ' line2',
      ' line3',
      '@@ -10,3 +11,4 @@',
      ' line10',
      '+added2',
      ' line11',
      ' line12',
    ].join('\n')
    const result = parseDiffToLineRanges(diff)
    expect(result.added).toEqual([
      { startLine: 2, endLine: 2 },
      { startLine: 12, endLine: 12 },
    ])
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/components/code-viewer-utils.test.ts`
Expected: FAIL — `parseDiffToLineRanges` is not exported

**Step 3: Implement `parseDiffToLineRanges`**

Add to `src/renderer/components/code-viewer-utils.ts`:

```typescript
export interface LineRange {
  startLine: number
  endLine: number
}

export interface DiffLineRanges {
  added: LineRange[]
  modified: LineRange[]
  deleted: number[]
}

/**
 * Parse a single-file unified diff into line ranges for Monaco decorations.
 * Line numbers are 1-based, matching Monaco's model.
 */
export function parseDiffToLineRanges(diffText: string): DiffLineRanges {
  if (!diffText.trim()) return { added: [], modified: [], deleted: [] }

  const added: LineRange[] = []
  const modified: LineRange[] = []
  const deleted: number[] = []

  const lines = diffText.split('\n')
  let modifiedLine = 0 // current line number in the modified file

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunkMatch) {
      modifiedLine = parseInt(hunkMatch[1], 10)
      continue
    }

    if (modifiedLine === 0) continue // skip file headers

    if (line.startsWith('-') && !line.startsWith('---')) {
      // Removed line — check if next line is an addition (= modification)
      // Collect consecutive removes
      const removeStart = i
      while (i + 1 < lines.length && lines[i + 1].startsWith('-') && !lines[i + 1].startsWith('---')) {
        i++
      }
      const removeCount = i - removeStart + 1

      // Check if followed by additions (= modifications)
      const addStart = i + 1
      let addCount = 0
      while (addStart + addCount < lines.length && lines[addStart + addCount].startsWith('+') && !lines[addStart + addCount].startsWith('+++')) {
        addCount++
      }

      if (addCount > 0) {
        // Lines that pair up are "modified", extras are added or deleted
        const paired = Math.min(removeCount, addCount)
        if (paired > 0) {
          modified.push({ startLine: modifiedLine, endLine: modifiedLine + paired - 1 })
        }
        if (addCount > paired) {
          added.push({ startLine: modifiedLine + paired, endLine: modifiedLine + addCount - 1 })
        }
        if (removeCount > paired) {
          // Extra deletes after the last modified line
          deleted.push(modifiedLine + paired - 1)
        }
        modifiedLine += addCount
        i = addStart + addCount - 1
      } else {
        // Pure deletion — mark position in modified file
        deleted.push(modifiedLine > 0 ? modifiedLine - 1 : 0)
      }
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      // Pure addition (not preceded by removes, handled above)
      const addStartLine = modifiedLine
      while (i + 1 < lines.length && lines[i + 1].startsWith('+') && !lines[i + 1].startsWith('+++')) {
        i++
        modifiedLine++
      }
      added.push({ startLine: addStartLine, endLine: modifiedLine })
      modifiedLine++
    } else if (!line.startsWith('\\')) {
      // Context line
      modifiedLine++
    }
  }

  return { added, modified, deleted }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/components/code-viewer-utils.test.ts`
Expected: PASS — all tests green

**Step 5: Commit**

```bash
git add src/renderer/components/code-viewer-utils.ts src/renderer/components/code-viewer-utils.test.ts
git commit -m "feat: add parseDiffToLineRanges utility for Monaco decorations"
```

---

### Task 2: Add per-file diff lookup to `useCodeView` and thread it through props

**Files:**
- Modify: `src/renderer/hooks/useCodeView.ts`
- Modify: `src/renderer/components/CodeViewer.tsx` (props only)
- Modify: `src/renderer/components/MainPanes.tsx` (props only)
- Modify: `src/renderer/App.tsx` (wire diff string)

**Step 1: Add `fileDiffMap` prop threading**

In `src/renderer/components/CodeViewer.tsx`, update the `CodeViewerProps` interface to replace `mode`/`diff`/`onShowDiff` with a `fileDiffText` prop:

```typescript
// Remove these from CodeViewerProps:
//   mode: ViewMode
//   diff: string
//   onShowDiff: () => void

// Add:
//   fileDiffText: string | null
```

Full new interface:
```typescript
interface CodeViewerProps {
  fileDiffText: string | null
  openFiles: OpenFile[]
  activeFilePath: string | null
  fileContent: string | null
  theme: string
  worktreeRoot: string | null
  onSelectTab: (filePath: string) => void
  onCloseTab: (filePath: string) => void
  onSaveFile?: (content: string) => void
  onClose?: () => void
}
```

In `src/renderer/components/MainPanes.tsx`, update `MainPanesProps`:
- Remove: `codeViewMode`, `diff`, `onShowDiff`
- Add: `fileDiffText: string | null`

In `src/renderer/App.tsx`:
- Compute `activeFileDiffText` by finding the matching file diff from the full diff string
- Pass `fileDiffText={activeFileDiffText}` to MainPanes instead of `codeViewMode`, `diff`, `onShowDiff`

Add to `App.tsx` after `const codeView = useCodeView(activeSessionId)`:
```typescript
const activeFileDiffText = useMemo(() => {
  if (!codeView.activeFilePath || !diff) return null
  const worktreeRoot = tree?.path ?? ''
  const relativePath = worktreeRoot
    ? codeView.activeFilePath.replace(worktreeRoot.replace(/\/$/, '') + '/', '')
    : codeView.activeFilePath
  const fileDiffs = splitDiffByFile(diff)
  const match = fileDiffs.find((fd) => fd.filePath === relativePath)
  return match ? diff.split(/^(?=diff --git )/m).find((chunk) => chunk.includes(`a/${relativePath} b/`)) ?? null : null
}, [diff, codeView.activeFilePath, tree?.path])
```

Import `splitDiffByFile` from `code-viewer-utils` in App.tsx.

**Step 2: Update `useCodeView.ts`**

Remove `CodeViewMode` type, `codeViewMode` state, `handleShowDiff`, and all `setCodeViewMode` calls.

Remove from return: `codeViewMode`, `handleShowDiff`

Update `handleCloseFile` — when closing the last tab, don't set mode to 'diff', just set `activeFilePath` to null.

Update `restoreState` — remove the `codeViewMode` parameter.

**Step 3: Update `useViewState.ts` and `useSessionStatePersistence.ts`**

Remove `codeViewMode` from the save/restore interfaces. In `useViewState.ts`, remove `codeViewMode` from `saveCurrentState`, `restoreCodeView`, and all `setRestoreCodeView` calls.

In `useSessionStatePersistence.ts`, remove `codeViewMode` from the save/restore calls.

In `src/shared/types.ts`, remove `codeViewMode` from `SessionViewState`.

**Step 4: Remove `onShowDiff` from `FileTree.tsx`**

Remove `onShowDiff` prop and the "X changed" button that calls it in the FileTree header. Keep the change count display but make it non-clickable (just a badge):

```typescript
{changes.length > 0 && (
  <span style={treeStyles.changesButton}>
    {changes.length} changed
  </span>
)}
```

Remove `onShowDiff` from the interface.

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — no type errors

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove Changes tab and onShowDiff, thread fileDiffText prop"
```

---

### Task 3: Apply Monaco decorations for diff gutter markers

**Files:**
- Modify: `src/renderer/components/CodeViewer.tsx`

**Step 1: Implement decoration logic in `CodeViewer`**

Replace the `EditorContent` component with a simplified version that only handles file mode. Add decoration application via a `useEffect` that runs when `fileDiffText` or `activeFilePath` changes.

In `CodeViewer.tsx`:

1. Remove imports: `DiffEditor`, `splitDiffByFile`, `FileDiff` type
2. Add imports: `parseDiffToLineRanges` from `code-viewer-utils`
3. Remove `ViewMode` type
4. Remove `fileDiffs` useMemo
5. Add a ref to track decoration IDs: `const decorationIds = useRef<string[]>([])`
6. Add a `useEffect` for applying decorations:

```typescript
useEffect(() => {
  const editor = editorRef.current
  if (!editor) return

  if (!fileDiffText) {
    // Clear decorations for non-modified files
    decorationIds.current = editor.deltaDecorations(decorationIds.current, [])
    return
  }

  const ranges = parseDiffToLineRanges(fileDiffText)
  const decorations: monacoEditor.IModelDeltaDecoration[] = []

  for (const range of ranges.added) {
    decorations.push({
      range: { startLineNumber: range.startLine, startColumn: 1, endLineNumber: range.endLine, endColumn: 1 },
      options: {
        isWholeLine: true,
        linesDecorationsClassName: 'diff-gutter-added',
        className: 'diff-line-added',
      },
    })
  }

  for (const range of ranges.modified) {
    decorations.push({
      range: { startLineNumber: range.startLine, startColumn: 1, endLineNumber: range.endLine, endColumn: 1 },
      options: {
        isWholeLine: true,
        linesDecorationsClassName: 'diff-gutter-modified',
        className: 'diff-line-modified',
      },
    })
  }

  for (const line of ranges.deleted) {
    decorations.push({
      range: { startLineNumber: Math.max(line, 1), startColumn: 1, endLineNumber: Math.max(line, 1), endColumn: 1 },
      options: {
        isWholeLine: true,
        linesDecorationsClassName: 'diff-gutter-deleted',
      },
    })
  }

  decorationIds.current = editor.deltaDecorations(decorationIds.current, decorations)
}, [fileDiffText])
```

7. Simplify `EditorContent` — remove all diff mode branches:

```typescript
function EditorContent({
  fileContent, language, monacoTheme, onMount,
}: {
  fileContent: string | null; language: string; monacoTheme: string; onMount?: OnMount
}): React.JSX.Element {
  if (fileContent !== null) {
    return <Editor value={fileContent} language={language} theme={monacoTheme} options={EDITABLE_OPTIONS} onMount={onMount} />
  }
  return (
    <div style={viewerStyles.empty}>Select a file to view its contents</div>
  )
}
```

8. Remove `SingleFileDiff`, `FileDiffSection`, `DiffFileHeader` components entirely.
9. Remove `LINE_HEIGHT` and `EDITOR_PADDING` constants.
10. Update `TabBar` — remove the "Changes" button and `onShowDiff`/`mode` props.
11. Update `NoTabsHeader` — remove `mode` prop, always show "No file selected".

**Step 2: Add CSS classes for decorations**

In `src/renderer/assets/main.css` (or the global stylesheet), add:

```css
.diff-gutter-added {
  background: var(--success) !important;
  width: 3px !important;
  margin-left: 3px;
}
.diff-line-added {
  background: rgba(40, 167, 69, 0.1) !important;
}
.diff-gutter-modified {
  background: var(--accent) !important;
  width: 3px !important;
  margin-left: 3px;
}
.diff-line-modified {
  background: rgba(79, 195, 247, 0.1) !important;
}
.diff-gutter-deleted {
  background: var(--error) !important;
  width: 3px !important;
  margin-left: 3px;
}
```

**Step 3: Run typecheck and dev server**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run dev` — manually verify decorations appear on modified files.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add inline diff gutter decorations to Monaco editor"
```

---

### Task 4: Clean up removed styles and unused code

**Files:**
- Modify: `src/renderer/components/CodeViewer.styles.ts`

**Step 1: Remove unused styles**

Remove from `viewerStyles`:
- `diffScroller`
- `fileDiffSection`
- `fileDiffHeader`
- `fileDiffPath`

These were only used by the now-removed `FileDiffSection`, `SingleFileDiff`, and `DiffFileHeader` components.

**Step 2: Remove `FILE_HEADER_HEIGHT` constant**

It was only used by `fileDiffHeader` style. Remove the constant from line 3.

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/renderer/components/CodeViewer.styles.ts
git commit -m "chore: remove unused diff view styles"
```

---

### Task 5: Run full test suite and typecheck

**Files:** None (verification only)

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests PASS

**Step 2: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS — no errors

**Step 3: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve test/type issues from diff decoration refactor"
```
