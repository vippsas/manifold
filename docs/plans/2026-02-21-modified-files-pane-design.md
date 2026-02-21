# Modified Files Pane

## Purpose

Add a dedicated pane that lists all modified files in the active agent's worktree. Clicking a file opens it in the editor. The pane sits between the file tree and the shell tabs in the right column.

## Layout

The right column's top area currently splits horizontally into Editor and File Tree. The File Tree area will be split vertically with a resizable divider:

```
Right column (top area):
┌──────────────┬────────────────┐
│  Editor      │  File Tree     │
│              ├── divider ─────┤
│              │  Modified Files│
└──────────────┴────────────────┘
Bottom:
┌───────────────────────────────┐
│  Shell Tabs                   │
└───────────────────────────────┘
```

A draggable horizontal divider between File Tree and Modified Files allows the user to resize the split. Default: 60% file tree, 40% modified files.

## Data Source

- Uses `watcherChanges` from `useFileWatcher` (polls `git status --porcelain` every 2 seconds)
- Type: `FileChange[]` where `FileChange = { path: string, type: 'added' | 'modified' | 'deleted' }`
- Paths are relative to the worktree root; resolved to absolute paths for `onSelectFile`
- No new IPC channels required

## Component: `ModifiedFiles.tsx`

### Props

```ts
interface ModifiedFilesProps {
  changes: FileChange[]
  activeFilePath: string | null
  worktreeRoot: string
  onSelectFile: (absolutePath: string) => void
}
```

### Behavior

- Renders a flat list of changed files
- Each row shows:
  - Change type indicator (colored dot): yellow for modified, green for added, red for deleted
  - Filename (basename) in normal weight
  - Relative directory path below in muted/smaller text
- Clicking a row calls `onSelectFile` with the absolute path (worktreeRoot + relative path), opening the file in the editor — same behavior as clicking in the file tree
- Active file highlighted when `activeFilePath` matches
- Empty state: "No changes" centered placeholder text
- Sorted: modified files first, then added, then deleted (alphabetical within each group)

### Styling

- Matches existing FileTree visual style (background, font, spacing)
- Section header "Modified Files" at the top with file count badge
- Scrollable if list exceeds pane height

## Resizing

- New horizontal divider managed via `usePaneResize`
- Same drag behavior as existing dividers
- Min height constraint to prevent either section from collapsing to zero

## Visibility

- Always visible when the right pane (file tree) is visible
- No separate toggle — shares visibility with the file tree pane
- No view state persistence needed

## Files to Modify

| File | Change |
|------|--------|
| `src/renderer/components/ModifiedFiles.tsx` | New component |
| `src/renderer/components/MainPanes.tsx` | Add ModifiedFiles pane with divider in right column |
| `src/renderer/hooks/usePaneResize.ts` | Add resize state for the new divider |
| `src/renderer/App.tsx` | Pass worktree root and changes to MainPanes |

## No New IPC

All data already available in the renderer via existing hooks. The `FileChange[]` array from `useFileWatcher` provides exactly the data needed.
