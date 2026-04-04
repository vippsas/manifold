# Unified Status Dots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4-color agent status dot system with a single accent-colored dot that blinks during active output and hides when the process exits.

**Architecture:** Main process tracks last PTY output time per session and emits `agent:activity-state` events when activity state changes (active→idle after 5s, idle→active on new output). Renderer consumes this as a simple boolean per session. CSS uses `var(--accent)` with a blink animation for active state.

**Tech Stack:** Electron IPC, React hooks, CSS animations

**Spec:** `docs/superpowers/specs/2026-04-04-unified-status-dots-design.md`

---

### Task 1: Add activity state tracking to main process

**Files:**
- Modify: `src/main/session/session-types.ts:12-40`
- Modify: `src/main/session/session-stream-wirer.ts:1-100`

- [ ] **Step 1: Add `lastOutputTime` to InternalSession**

In `src/main/session/session-types.ts`, add the field to the interface:

```typescript
// After line 21 (detectedVercelUrl)
  /** Timestamp of most recent PTY output — used for activity-state tracking */
  lastOutputTime?: number
```

- [ ] **Step 2: Add idle timer map and activity emission to SessionStreamWirer**

In `src/main/session/session-stream-wirer.ts`, add a timer map and helper method:

```typescript
// After line 16 (private gitOps declaration)
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
```

Add a private method after `setGitOps()` (after line 29):

```typescript
  /**
   * Track PTY output activity per session.
   * Emits `agent:activity-state` when transitioning between active/idle.
   * Active = PTY output within last 5 seconds. Idle = no output for 5s.
   */
  private trackActivity(session: InternalSession): void {
    const wasIdle = !session.lastOutputTime ||
      Date.now() - session.lastOutputTime > 5000
    session.lastOutputTime = Date.now()

    if (wasIdle) {
      this.sendToRenderer('agent:activity-state', {
        sessionId: session.id,
        isOutputting: true,
      })
    }

    // Reset the 5-second idle timer
    const existing = this.idleTimers.get(session.id)
    if (existing) clearTimeout(existing)

    this.idleTimers.set(
      session.id,
      setTimeout(() => {
        this.idleTimers.delete(session.id)
        this.sendToRenderer('agent:activity-state', {
          sessionId: session.id,
          isOutputting: false,
        })
      }, 5000)
    )
  }

  /** Clear idle timer for a session (call on exit or cleanup). */
  clearActivityTimer(sessionId: string): void {
    const timer = this.idleTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.idleTimers.delete(sessionId)
    }
  }
```

- [ ] **Step 3: Call trackActivity in wireOutputStreaming**

In `src/main/session/session-stream-wirer.ts`, inside `wireOutputStreaming`'s `onData` callback, add after line 39 (`session.nlOutputBuffer?.append(data)`):

```typescript
      this.trackActivity(session)
```

- [ ] **Step 4: Call trackActivity in wireStreamJsonOutput**

In `wireStreamJsonOutput`'s `onData` callback, add after line 121 (`this.checkVercelDeploy(session)`):

```typescript
      this.trackActivity(session)
```

- [ ] **Step 5: Emit idle on exit and clear timer in wireExitHandling**

In `wireExitHandling` (line 92), add before the existing `this.sendToRenderer('agent:status', ...)` call:

```typescript
      this.clearActivityTimer(session.id)
      this.sendToRenderer('agent:activity-state', {
        sessionId: session.id,
        isOutputting: false,
      })
```

- [ ] **Step 6: Run typecheck**

Run: `cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-colors && npm run typecheck`
Expected: PASS (no type errors)

- [ ] **Step 7: Commit**

```bash
git add src/main/session/session-types.ts src/main/session/session-stream-wirer.ts
git commit -m "feat: add PTY activity state tracking with 5s idle timer"
```

---

### Task 2: Whitelist the new IPC channel in preload

**Files:**
- Modify: `src/preload/index.ts:101-120`

- [ ] **Step 1: Add `agent:activity-state` to ALLOWED_LISTEN_CHANNELS**

In `src/preload/index.ts`, add after `'agent:activity'` (line 103):

```typescript
  'agent:activity-state',
```

So the array becomes:
```typescript
const ALLOWED_LISTEN_CHANNELS = [
  'agent:output',
  'agent:activity',
  'agent:activity-state',
  'agent:status',
  // ... rest unchanged
```

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-colors && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: whitelist agent:activity-state IPC channel in preload"
```

---

### Task 3: Add renderer hook for activity state

**Files:**
- Modify: `src/renderer/hooks/useAgentSession.ts:1-69`

- [ ] **Step 1: Add activity state event type**

In `src/renderer/hooks/useAgentSession.ts`, add after the `AgentSessionsChangedEvent` interface (after line 17):

```typescript
interface AgentActivityStateEvent {
  sessionId: string
  isOutputting: boolean
}
```

- [ ] **Step 2: Add `useActivityStateListener` hook**

Add after the `useExitListener` function (after line 155):

```typescript
function useActivityStateListener(): Set<string> {
  const [outputtingIds, setOutputtingIds] = useState<Set<string>>(new Set())

  useIpcListener<AgentActivityStateEvent>(
    'agent:activity-state',
    useCallback(
      (event: AgentActivityStateEvent) => {
        setOutputtingIds((prev) => {
          const next = new Set(prev)
          if (event.isOutputting) {
            next.add(event.sessionId)
          } else {
            next.delete(event.sessionId)
          }
          // Avoid re-render if nothing changed
          if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev
          return next
        })
      },
      []
    )
  )

  return outputtingIds
}
```

- [ ] **Step 3: Wire into useAgentSession and export**

In the `useAgentSession` function, add after `useAutoResume` call (after line 55):

```typescript
  const outputtingSessionIds = useActivityStateListener()
```

Update the `UseAgentSessionResult` interface (line 37) to add:

```typescript
  outputtingSessionIds: Set<string>
```

Update the return statement (line 68) to include:

```typescript
  return { sessions, activeSessionId, activeSession, spawnAgent, killAgent, deleteAgent, setActiveSession, resumeAgent, outputtingSessionIds }
```

- [ ] **Step 4: Run typecheck**

Run: `cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-colors && npm run typecheck`
Expected: Type errors in files that consume `UseAgentSessionResult` — these will be fixed in subsequent tasks.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useAgentSession.ts
git commit -m "feat: add useActivityStateListener hook for PTY output tracking"
```

---

### Task 4: Thread outputtingSessionIds through DockState to sidebar

**Files:**
- Modify: `src/renderer/components/editor/dock-panel-types.ts`
- Modify: `src/renderer/App.tsx:250-288`
- Modify: `src/renderer/components/editor/dock-panels.tsx`
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx:9-26,28-45,135-140,142-157,191-260`
- Modify: `src/renderer/components/sidebar/AgentItem.tsx:34-40,42,78,84`

- [ ] **Step 1: Add outputtingSessionIds to DockAppState**

In `src/renderer/components/editor/dock-panel-types.ts`, find the `DockAppState` interface (or type) and add:

```typescript
  outputtingSessionIds: Set<string>
```

near the other projects/sessions fields (near `allProjectSessions`).

- [ ] **Step 2: Pass outputtingSessionIds in App.tsx dockState**

In `src/renderer/App.tsx`, destructure `outputtingSessionIds` from `useAgentSession` where sessions are used. Then add it to the `dockState` object (around line 278):

```typescript
    outputtingSessionIds: agentSession.outputtingSessionIds,
```

(The exact destructuring depends on how `useAgentSession` is called — find where `sessions`, `activeSessionId` etc. are destructured and add `outputtingSessionIds`.)

- [ ] **Step 3: Pass outputtingSessionIds to ProjectSidebar from dock-panels.tsx**

In `src/renderer/components/editor/dock-panels.tsx`, in the `ProjectsPanel` function, pass the new prop:

```tsx
    <ProjectSidebar
      // ... existing props
      outputtingSessionIds={s.outputtingSessionIds}
    />
```

- [ ] **Step 4: Update ProjectSidebar props and thread to components**

In `src/renderer/components/sidebar/ProjectSidebar.tsx`:

Add to `ProjectSidebarProps` interface (line 9):
```typescript
  outputtingSessionIds: Set<string>
```

Destructure it in the component (line 28). Pass it through to `ProjectList`:

Add to `ProjectListProps` interface (around line 120):
```typescript
  outputtingSessionIds: Set<string>
```

Pass it when rendering `<ProjectList>`.

- [ ] **Step 5: Update AgentItem to accept and use isOutputting**

In `src/renderer/components/sidebar/AgentItem.tsx`, add to `AgentItemProps` (line 34):

```typescript
  isOutputting: boolean
```

Destructure it in the component (line 42):
```typescript
export function AgentItem({ session, projectPath, isActive, isOutputting, onSelect, onDelete }: AgentItemProps): React.JSX.Element {
```

Update the row className (line 78) — replace status-based class with alive/exited:
```typescript
      className={`sidebar-item-row sidebar-agent-row ${session.status === 'done' || session.status === 'error' ? 'sidebar-agent-row--exited' : 'sidebar-agent-row--alive'}${isActive ? ' sidebar-item-row--active' : ''}`}
```

Update the dot (line 84) — replace status-based class with activity-based:
```typescript
        <span className={`status-dot${session.status === 'done' || session.status === 'error' ? ' status-dot--hidden' : isOutputting ? ' status-dot--active' : ''}`} />
```

- [ ] **Step 6: Pass isOutputting to AgentItem in ProjectList**

In `ProjectSidebar.tsx`, where `<AgentItem>` is rendered (lines 208-215), add the prop:

```tsx
<AgentItem
  key={session.id}
  session={session}
  projectPath={activeProject.path}
  isActive={session.id === activeSessionId}
  isOutputting={outputtingSessionIds.has(session.id)}
  onSelect={(sessionId) => onSelectSession(sessionId, activeProject.id)}
  onDelete={() => onRequestDeleteAgent(session, activeProject.path)}
/>
```

- [ ] **Step 7: Update mini dots in collapsed project view**

In `ProjectSidebar.tsx`, replace the `STATUS_DOT_COLORS` usage (lines 248-259).

Remove the `STATUS_DOT_COLORS` constant (lines 135-140).

Replace the mini dots rendering with:

```tsx
<div style={sidebarStyles.miniStatusDots}>
  {projectSessions
    .filter((session) => session.status !== 'done' && session.status !== 'error')
    .map((session) => (
      <span
        key={session.id}
        title={session.branchName}
        className={outputtingSessionIds.has(session.id) ? 'status-dot--active' : ''}
        style={{
          ...sidebarStyles.miniDot,
          background: 'var(--accent)',
        }}
      />
    ))}
</div>
```

This hides dots for exited sessions and uses accent color with blink for active ones.

- [ ] **Step 8: Run typecheck**

Run: `cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-colors && npm run typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/editor/dock-panel-types.ts src/renderer/App.tsx src/renderer/components/editor/dock-panels.tsx src/renderer/components/sidebar/ProjectSidebar.tsx src/renderer/components/sidebar/AgentItem.tsx
git commit -m "feat: thread outputtingSessionIds through to sidebar components"
```

---

### Task 5: Update CSS — replace 4-color system with accent + blink

**Files:**
- Modify: `src/renderer/styles/theme.css:82-85,380-403,558-572`

- [ ] **Step 1: Remove status color CSS variables**

In `src/renderer/styles/theme.css`, remove lines 82-85:

```css
  --status-running: #42a5f5;
  --status-waiting: #ffca28;
  --status-done: #66bb6a;
  --status-error: #ef5350;
```

- [ ] **Step 2: Replace status dot classes**

Replace the entire status dot section (lines 380-403):

```css
/* ─── Status Dot Utility ─── */
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--accent);
}

@keyframes dot-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}

.status-dot--active {
  animation: dot-blink 1.4s ease-in-out infinite;
}

.status-dot--hidden {
  visibility: hidden;
}
```

- [ ] **Step 3: Replace sidebar agent row status classes**

Replace lines 558-572:

```css
.sidebar-agent-row--alive {
  border-left-color: var(--accent);
}

.sidebar-agent-row--exited {
  border-left-color: transparent;
}
```

- [ ] **Step 4: Check for any other references to removed CSS variables**

Run: `cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-colors && grep -r 'status-running\|status-waiting\|status-done\|status-error' src/`

If any references remain in other files, update them. The `STATUS_DOT_COLORS` in `ProjectSidebar.tsx` should already be removed in Task 4.

- [ ] **Step 5: Run typecheck and test**

Run: `cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-colors && npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "feat: replace 4-color status dots with accent color + blink animation"
```

---

### Task 6: Update tests

**Files:**
- Modify: `src/renderer/components/sidebar/ProjectSidebar.test.tsx`
- Modify: Any other test files that reference status dot classes or STATUS_DOT_COLORS

- [ ] **Step 1: Find affected tests**

Run: `cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-colors && grep -r 'status-dot--running\|status-dot--waiting\|status-dot--done\|status-dot--error\|STATUS_DOT_COLORS\|sidebar-agent-row--running\|sidebar-agent-row--waiting\|sidebar-agent-row--done\|sidebar-agent-row--error' src/ --include='*.test.*'`

- [ ] **Step 2: Update tests to use new class names**

Replace any references to old status-based classes with the new ones:
- `status-dot--running` / `status-dot--waiting` → `status-dot--active` or plain `status-dot` (depending on test scenario)
- `status-dot--done` / `status-dot--error` → `status-dot--hidden`
- `sidebar-agent-row--running` / `sidebar-agent-row--waiting` → `sidebar-agent-row--alive`
- `sidebar-agent-row--done` / `sidebar-agent-row--error` → `sidebar-agent-row--exited`

If tests render `<AgentItem>`, add the new `isOutputting` prop.

- [ ] **Step 3: Run tests**

Run: `cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-colors && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: update tests for unified status dot system"
```

---

### Task 7: Verify end-to-end and clean up

- [ ] **Step 1: Run full check**

Run: `cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-colors && npm run typecheck && npm test`
Expected: PASS for both

- [ ] **Step 2: Verify no stale references**

Run: `cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-colors && grep -r 'status-running\|status-waiting\|status-done\|status-error\|STATUS_DOT_COLORS' src/`
Expected: No matches

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: clean up stale status color references"
```
