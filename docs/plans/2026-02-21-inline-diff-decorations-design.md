# Inline Diff Decorations in Editor

## Summary

Remove the dedicated "Changes" tab from CodeViewer. Instead, when a modified file is opened in the editor, show git diff information as inline Monaco decorations (colored gutter bars and line highlights). The editor remains fully editable.

## Current State

- `CodeViewer.tsx` has a "Changes" tab that switches to a full diff view using Monaco's `DiffEditor`
- Clicking a modified file in `ModifiedFiles.tsx` opens it in normal edit mode with no diff context
- The `mode` prop toggles between `'diff'` and `'file'`

## Design

### Behavior

- **Modified files**: Open in editable Monaco `Editor` with colored decorations:
  - Green gutter bar + light green background for **added** lines
  - Blue gutter bar + light blue background for **modified** lines
  - Red marker in gutter for **deleted** line locations
- **Non-modified files**: Open normally with no decorations
- **Decorations auto-refresh** when diff data updates (file watcher triggers)

### Components Affected

| File | Change |
|------|--------|
| `CodeViewer.tsx` | Remove "Changes" tab, `DiffEditor` import, diff rendering mode. Add decoration logic to `Editor` via `onMount` ref. |
| `code-viewer-utils.ts` | Add `parseDiffToLineRanges(fileDiff)` to convert diff hunks into `{added: Range[], modified: Range[], deleted: number[]}` |
| `useCodeView.ts` | When opening a modified file, find its per-file diff string for decoration |
| `App.tsx` | Remove `onShowDiff` prop threading; mode is always `'file'` |

### Data Flow

```
Modified file clicked
  -> useCodeView opens file + finds matching diff from useDiff data
  -> CodeViewer receives file content + per-file diff string
  -> parseDiffToLineRanges() computes line ranges
  -> Monaco deltaDecorations() applies gutter + background decorations
  -> When diff updates, decorations refresh
```

### Removals

- `mode: 'diff' | 'file'` distinction
- "Changes" tab button
- `SingleFileDiff` and `FileDiffSection` components
- `DiffEditor` import from Monaco
- `onShowDiff` callback chain
