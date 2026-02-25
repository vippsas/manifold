# File Tree Branch Display Design

## Goal

Show the git branch name (or path fallback) as a subtitle under each directory root in the file tree pane, with a subtle "external" label for directories added via `/add-dir`.

## Visual Design

**Primary worktree:**
```
MANIFOLD-TEST
  manifold/test
```

**Additional (external) directory:**
```
MANIFOLD-LANDINGPAGE              external
  main
```

**Non-git directory (fallback):**
```
SOME-FOLDER                       external
  ~/path/to/some-folder
```

### Styling

- Header line: unchanged (uppercase, 11px, fontWeight 600, `--text-secondary`)
- "external" label: same line as header, right-aligned, dimmed (`--text-tertiary`), 11px, normal weight
- Subtitle line: below header, 10px, normal weight, `--text-tertiary`, slight left padding. Shows full branch name or `~/shortened-path` as fallback
- Path shortening: replace `$HOME` with `~`

## Data Model

New type in `src/shared/types.ts`:

```typescript
export interface DirInfo {
  branch: string | null  // git branch name, null if not a git repo
  path: string           // absolute directory path
}
```

`WorkspaceRootHeader` props expand to:

- `name: string` — directory basename (existing)
- `branch: string | null` — git branch, null if not a git repo
- `path: string` — absolute path, used as fallback subtitle
- `isAdditional: boolean` — whether this is an `/add-dir` directory

## IPC

New invoke channel: `files:dir-branch`

- Input: `dirPath: string`
- Output: `string | null`
- Implementation: runs `git rev-parse --abbrev-ref HEAD` in the given directory, returns null on failure

## Data Flow

1. Primary worktree: branch from `session.branchName` (already available)
2. Additional directories: branch from `files:dir-branch` IPC call on discovery + refresh on `files:changed`
3. `FileTree` receives branch info as props and renders subtitle

## Files Changed

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `DirInfo` interface |
| `src/main/ipc/file-handlers.ts` | Add `files:dir-branch` handler |
| `src/preload/index.ts` | Whitelist `files:dir-branch` in invoke channels |
| `src/renderer/hooks/useAdditionalDirs.ts` | Fetch branch per additional dir, store in `Map<string, string \| null>`, refresh on `files:changed` |
| `src/renderer/components/FileTree.tsx` | Expand `WorkspaceRootHeader` to accept new props; render subtitle + "external" label |
