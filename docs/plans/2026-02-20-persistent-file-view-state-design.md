# Persistent File View State Per Agent

## Problem

When switching between agents, the file tree expansion state and open file tabs are lost. The file tree resets to default expansion, and open tabs remain stale from the previous agent rather than restoring the target agent's previously open files.

## Solution

A `ViewStateStore` in the main process (following the `SettingsStore` pattern) persists per-session view state to disk at `~/.manifold/view-state.json`. The renderer saves state on switch-away and restores it on switch-to.

## Data Shape

```ts
interface SessionViewState {
  openFilePaths: string[]       // relative paths of open tabs
  activeFilePath: string | null // which tab is focused
  codeViewMode: 'diff' | 'file'
  expandedPaths: string[]       // absolute paths of expanded directories
}
```

On-disk format (`~/.manifold/view-state.json`):

```json
{
  "session-abc": {
    "openFilePaths": ["src/main.ts"],
    "activeFilePath": "src/main.ts",
    "codeViewMode": "file",
    "expandedPaths": ["/path/to/worktree/src"]
  }
}
```

## Main Process: ViewStateStore

Mirrors `SettingsStore`:
- Constructor loads from `~/.manifold/view-state.json`
- `get(sessionId)` — returns `SessionViewState | null`
- `set(sessionId, state)` — saves and writes to disk
- `delete(sessionId)` — removes entry and writes to disk

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `view-state:get` | invoke | Load state for a session |
| `view-state:set` | invoke | Save state for a session |
| `view-state:delete` | invoke | Remove state on agent deletion |

## Renderer Changes

### `useViewState(activeSessionId)` (new hook)
- On session switch: saves current state, loads target state
- Exposes `expandedPaths`, `onToggleExpand`, and manages save/load lifecycle
- Coordinates with `useCodeView` to restore open file tabs

### `useCodeView` modifications
- Accepts restored state (open file paths, active path, mode) on session switch
- Re-reads file contents for restored paths via `files:read`

### `FileTree` modifications
- New prop `expandedPaths: Set<string>` replaces internal `useState` in `TreeNode`
- New prop `onToggleExpand(path: string)` for click handling
- Expansion becomes fully controlled by parent

### `App.tsx` orchestration
- Instantiates `useViewState`
- Passes `expandedPaths` and `onToggleExpand` through `MainPanes` to `FileTree`

## Cleanup

When `deleteAgent` is called, it also invokes `view-state:delete` for that session. This piggybacks on the existing agent deletion flow.

## Data Flow

```
Switch agent A → B:
  1. Save A's state: view-state:set(A, {tabs, expanded})
  2. Load B's state: view-state:get(B)
  3. Re-read B's open file contents via files:read
  4. Render B's tree with B's expandedPaths
```
