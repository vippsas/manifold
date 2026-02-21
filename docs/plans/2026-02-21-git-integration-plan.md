# Git Integration — Implementation Plan

**Goal**: Add first-class git operations (commit with AI message, PR creation, conflict resolution) to Manifold via slide-in panels, AI-assisted text generation, and new IPC channels.

**Architecture**: New `GitOperationsManager` main-process module handles git commands and AI generation. Five new IPC channels bridge main↔renderer. Three slide-in panel components replace the center pane (CodeViewer). `FileWatcher` extended to detect merge conflicts. `StatusBar` gains conditional action buttons.

**Tech stack**: TypeScript, React, Electron IPC, `child_process.execFile`, existing `node-pty` runtimes for AI generation.

---

## Files to Create/Modify (Build Order)

### 1. `src/shared/types.ts` (modify)

**Purpose**: Add shared types for git operations.
**Key exports**:
- `GitStatusDetail`: `{ conflicts: string[], staged: string[], unstaged: string[] }`
- `AheadBehind`: `{ ahead: number, behind: number }`
- `ConflictFile`: `{ path: string }`

**Dependencies**: None

### 2. `src/main/git-operations.ts` (create)

**Purpose**: Main-process module encapsulating all git commands and AI generation.
**Key exports**:
- `class GitOperationsManager`
  - `commit(worktreePath: string, message: string): Promise<void>`
  - `getAheadBehind(worktreePath: string, baseBranch: string): Promise<AheadBehind>`
  - `getConflicts(worktreePath: string): Promise<string[]>`
  - `resolveConflict(worktreePath: string, filePath: string, resolvedContent: string): Promise<void>`
  - `aiGenerate(runtimeBinary: string, prompt: string, cwd: string): Promise<string>`

**Dependencies**: `child_process.execFile`, `node:fs/promises`, `src/shared/types.ts`

### 3. `src/main/ipc-handlers.ts` (modify)

**Purpose**: Register 4 new invoke IPC handlers: `git:commit`, `git:ai-generate`, `git:ahead-behind`, `git:resolve-conflict`.
**Changes**:
- Add `GitOperationsManager` to `IpcDependencies`
- Add `registerGitHandlers(deps)` function
- Wire into `registerIpcHandlers()`

**Dependencies**: `GitOperationsManager`, `SessionManager`, `ProjectRegistry`

### 4. `src/main/file-watcher.ts` (modify)

**Purpose**: Extend `parseStatus()` to detect conflict markers (`UU`, `AA`, `DD`). Push `agent:conflicts` event to renderer when conflicts detected.
**Changes**:
- Add conflict detection to `parseStatus()` — return `{ changes, conflicts }` instead of just changes
- In `poll()`, emit `agent:conflicts` event when conflicts are detected

**Dependencies**: None (internal change)

### 5. `src/main/index.ts` (modify)

**Purpose**: Instantiate `GitOperationsManager` and pass to `registerIpcHandlers()`.
**Changes**: Add `const gitOps = new GitOperationsManager()` and include in deps.

**Dependencies**: `GitOperationsManager`

### 6. `src/preload/index.ts` (modify)

**Purpose**: Whitelist 4 new invoke channels and 1 new listen channel.
**Changes**:
- Add `'git:commit'`, `'git:ai-generate'`, `'git:ahead-behind'`, `'git:resolve-conflict'` to `ALLOWED_INVOKE_CHANNELS`
- Add `'agent:conflicts'` to `ALLOWED_LISTEN_CHANNELS`

**Dependencies**: None

### 7. `src/renderer/hooks/useGitOperations.ts` (create)

**Purpose**: Custom hook providing git commit, AI generation, ahead/behind polling, and conflict state.
**Key exports**:
- `useGitOperations(sessionId, runtimeId, baseBranch)` → `{ commit, aiGenerate, aheadBehind, conflicts, refreshAheadBehind }`
- Subscribes to `agent:conflicts` push channel
- Polls `git:ahead-behind` after commit and on session focus

**Dependencies**: `src/shared/types.ts`, preload API

### 8. `src/renderer/components/CommitPanel.tsx` (create)

**Purpose**: Slide-in panel with changed files list, AI-generated commit message textarea, and Commit button.
**Key exports**: `CommitPanel` component
**Props**: `sessionId`, `runtimeId`, `changedFiles`, `diff`, `onCommit`, `onClose`
**Behavior**:
- On mount: calls `git:ai-generate` with the diff to generate commit message
- Textarea editable at all times, shows spinner placeholder while generating
- Commit button calls `git:commit` and closes panel

**Dependencies**: `useGitOperations` hook

### 9. `src/renderer/components/PRPanel.tsx` (create)

**Purpose**: Slide-in panel with AI-generated PR title + description, base branch display, Push & Create PR button.
**Key exports**: `PRPanel` component
**Props**: `sessionId`, `runtimeId`, `branchName`, `baseBranch`, `onClose`
**Behavior**:
- On mount: calls `git:ai-generate` twice (title + description)
- Title and description fields editable
- Push & Create PR button calls existing `pr:create` IPC

**Dependencies**: `useGitOperations` hook

### 10. `src/renderer/components/ConflictPanel.tsx` (create)

**Purpose**: Slide-in panel listing conflicted files with View and Resolve with AI actions.
**Key exports**: `ConflictPanel` component
**Props**: `sessionId`, `runtimeId`, `conflicts`, `onResolve`, `onClose`
**Behavior**:
- Lists each conflicted file
- "View" opens file in Monaco (via existing `onSelectFile`)
- "Resolve with AI" calls `git:ai-generate` with file content, shows proposed resolution
- Accept/Edit buttons, then `git:resolve-conflict`
- "Complete Merge" button when all resolved

**Dependencies**: `useGitOperations` hook

### 11. `src/renderer/components/StatusBar.tsx` (modify)

**Purpose**: Add Commit, Create PR, and Conflicts buttons to the right side of the status bar.
**Changes**:
- New props: `conflicts`, `aheadBehind`, `onCommit`, `onCreatePR`, `onShowConflicts`
- "Commit" button shown when `changedFiles.length > 0` and no conflicts
- "Create PR" shown when `aheadBehind.ahead > 0`
- "Conflicts" badge shown when `conflicts.length > 0` (replaces Commit button)

**Dependencies**: `AheadBehind` type

### 12. `src/renderer/App.tsx` (modify)

**Purpose**: Wire new hooks and panel components. Manage panel visibility state.
**Changes**:
- Add `useGitOperations` hook
- Add panel state: `activePanel: 'commit' | 'pr' | 'conflicts' | null`
- Pass handlers to `StatusBar` for opening panels
- Render `CommitPanel` / `PRPanel` / `ConflictPanel` in the center pane area when active
- Refresh diff and ahead/behind after commit

**Dependencies**: All new components and hooks

### 13. `src/renderer/styles/theme.css` (modify)

**Purpose**: Add CSS classes for slide-in panels.
**Changes**:
- `.git-panel` — slide-in panel base styles
- `.git-panel-header`, `.git-panel-body`, `.git-panel-footer` — layout
- `.conflict-badge` — warning color badge for status bar

**Dependencies**: None

---

## IPC Channel Summary

| Channel | Direction | Handler | Purpose |
|---------|-----------|---------|---------|
| `git:commit` | invoke | `GitOperationsManager.commit()` | `git add . && git commit -m` |
| `git:ai-generate` | invoke | `GitOperationsManager.aiGenerate()` | Run runtime non-interactively |
| `git:ahead-behind` | invoke | `GitOperationsManager.getAheadBehind()` | Commits ahead/behind base |
| `git:resolve-conflict` | invoke | `GitOperationsManager.resolveConflict()` | Write resolved file + git add |
| `agent:conflicts` | push | `FileWatcher.poll()` | Conflicted file paths |

## Implementation Notes

- AI generation uses the session's runtime binary with `-p` flag (confirmed for Claude). The `aiGenerate()` method accepts the full binary path and prompt, with a 15-second timeout and empty string fallback.
- The `git:ai-generate` handler must resolve the runtime binary from `session.runtimeId` using `getRuntimeById()`.
- Conflict detection in `FileWatcher` checks for `UU`, `AA`, `DD` status codes in `git status --porcelain` output.
- Panels slide into the center pane column (replacing CodeViewer temporarily). They are not modals.
- The `git:resolve-conflict` handler validates the file path is within the worktree (path traversal protection, same pattern as `files:write`).
