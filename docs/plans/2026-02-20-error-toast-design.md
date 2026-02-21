# Error Toast System Design

## Problem

IPC errors (e.g. git worktree failures, agent spawn errors) are caught silently in renderer hooks or logged only to the dev console. Users see no feedback when critical operations fail.

## Scope

Critical errors only — operations that block the user's workflow:
- Agent spawn failures (git worktree errors, branch conflicts)
- Project CRUD failures

Soft errors (file read/write, diff unavailable) are excluded from initial implementation.

## Architecture

### Event Emitter (`src/renderer/toast.ts`)

Module-level event emitter. Chosen over React Context (codebase uses zero context providers) and prop drilling (too invasive).

Exports:
- `emitError(message: string)` — any hook can call this to surface an error
- `onError(callback: (msg: string) => void): () => void` — returns unsubscribe function

### Toast Component (`src/renderer/components/Toast.tsx`)

- Fixed position, bottom-right corner, high z-index
- Subscribes to `onError` on mount, cleans up on unmount
- Maintains a queue of active toasts (max 3 visible)
- Each toast: error icon + message + dismiss X button
- Auto-dismiss after 5 seconds with fade-out transition
- Styled with CSS variables from existing theme system

### Integration Points

| Hook | Current Behavior | Change |
|------|-----------------|--------|
| `useAgentSession.ts` | Catches spawn errors, returns `null` silently | Add `emitError(err.message)` in catch block |
| `useProjects.ts` | Has `setError()` state but never displayed | Add `emitError(message)` alongside existing `setError()` |

### Data Flow

```
Hook catches IPC error
  → emitError("branch 'DAL-103' already exists")
  → Toast component (subscribed via onError) adds to queue
  → Renders toast with auto-dismiss timer
  → Fades out after 5s or user clicks X
```

### Changes to Existing Files

- `App.tsx` — Add `<Toast />` at root level
- `useAgentSession.ts` — Add `emitError()` in spawn error catch
- `useProjects.ts` — Add `emitError()` alongside `setError()` calls
