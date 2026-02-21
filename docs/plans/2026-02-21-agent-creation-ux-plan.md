# Agent Creation UX — Implementation Plan

## Goal

Replace the infrastructure-first agent creation flow with a task-first experience: task description textarea as primary field, auto-derived branch names, task description displayed in sidebar, and a simplified welcome dialog.

## Architecture

The changes span all three Electron layers: shared types gain a `taskDescription` field, the main process persists it in worktree metadata and exposes it on sessions, and the renderer replaces `NewAgentPopover` with a task-first `NewTaskModal`, updates the sidebar to show task descriptions as primary labels, and simplifies the welcome dialog to skip storage path configuration.

## Tech Stack

No new dependencies. All changes use existing React, TypeScript, and Electron IPC infrastructure.

## Build Order

### 1. `src/shared/types.ts` — Add `taskDescription` to `AgentSession`

- **Purpose**: Add optional `taskDescription?: string` field to `AgentSession` interface
- **Key changes**: Single field addition
- **Dependencies**: None (foundation for everything else)

### 2. `src/shared/derive-branch-name.ts` — Branch name derivation utility (NEW FILE)

- **Purpose**: Pure function that converts task description text into a kebab-case branch name with `manifold/` prefix
- **Key exports**: `deriveBranchName(description: string): string`
- **Logic**: Lowercase, strip stopwords (the, a, an, in, to, for, of, on, is, it, its, with, from, by, at, as, be, or, and, but, not, this, that), take first 4-5 meaningful words, kebab-case, prefix `manifold/`, truncate at 40 chars on word boundary
- **Dependencies**: None (pure utility)

### 3. `src/main/session-manager.ts` — Persist and expose `taskDescription`

- **Purpose**: Store `taskDescription` in session data and worktree metadata; return it in public session
- **Key changes**:
  - `InternalSession` gains `taskDescription?: string`
  - `buildSession()` reads `options.prompt` into `taskDescription`
  - `writeWorktreeMeta()` includes `taskDescription`
  - `readWorktreeMeta()` reads `taskDescription`
  - `toPublicSession()` includes `taskDescription`
  - `discoverSessionsForProject()` reads `taskDescription` from meta
- **Dependencies**: `src/shared/types.ts`

### 4. `src/renderer/components/NewTaskModal.tsx` — Replace NewAgentPopover (NEW FILE, replaces old)

- **Purpose**: Task-first modal with textarea as primary field, agent dropdown, collapsible Advanced section with branch name
- **Key exports**: `NewTaskModal` component
- **Props**: `visible`, `projectId`, `defaultRuntime`, `onLaunch`, `onClose`
- **Behavior**:
  - Textarea autofocused, required (Start Task disabled when empty)
  - Agent dropdown defaults to `settings.defaultRuntime`
  - Branch auto-derived from description with 300ms debounce
  - Advanced section collapsed by default, reveals editable branch
  - "Start Task" button → "Starting..." on click → invokes `agent:spawn` with `{ projectId, runtimeId, prompt: taskDescription, branchName }`
- **Dependencies**: `src/shared/derive-branch-name.ts`, `src/shared/types.ts`

### 5. `src/renderer/components/NewTaskModal.styles.ts` — Styles for NewTaskModal (NEW FILE)

- **Purpose**: Inline style objects matching existing modal patterns (WelcomeDialog, NewAgentPopover)
- **Dependencies**: None

### 6. `src/renderer/components/WelcomeDialog.tsx` — Simplify to open/clone only

- **Purpose**: Remove storage path configuration; show "Open a local project" and "Clone a repository" buttons
- **Key changes**:
  - Remove storage path input and browse button
  - Replace with two action buttons: "Open a local project" → OS dir picker, "Clone a repository" → inline URL input
  - On success: call `onConfirm()` (which triggers `setupCompleted: true` with default storage path)
- **Props change**: Remove `defaultPath`, add `onAddProject`, `onCloneProject`
- **Dependencies**: None

### 7. `src/renderer/components/ProjectSidebar.tsx` — Show task description in sidebar

- **Purpose**: Display task description as primary label, branch + runtime as secondary
- **Key changes**:
  - `AgentItem` shows `session.taskDescription` as primary text when available
  - Falls back to branch name display for legacy sessions
  - Branch name + runtime shown smaller below
  - Rename "+ New Agent" button to "+ New Task"
- **Dependencies**: `src/shared/types.ts` (for `taskDescription` field)

### 8. `src/renderer/components/OnboardingView.tsx` — Rename to "New Task"

- **Purpose**: Update copy from "New Agent" to "New Task" in the no-agent state
- **Key changes**: Button text and description text updates
- **Dependencies**: None

### 9. `src/renderer/App.tsx` — Wire new components

- **Purpose**: Replace `NewAgentPopover` import with `NewTaskModal`, update WelcomeDialog props, thread `taskDescription` through sidebar
- **Key changes**:
  - Import `NewTaskModal` instead of `NewAgentPopover`
  - Update `WelcomeDialog` usage to new API (remove `defaultPath`, add callbacks)
  - `handleSetupComplete` simplified to just set `setupCompleted: true`
  - Rename callback props from "NewAgent" to "NewTask" where user-facing
- **Dependencies**: All above components

### 10. Delete `src/renderer/components/NewAgentPopover.tsx` and `NewAgentPopover.styles.ts`

- **Purpose**: Remove old component files after NewTaskModal replaces them
- **Dependencies**: Step 9 (imports updated first)
