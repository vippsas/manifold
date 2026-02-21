# Status Notification Sound — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Play the system notification sound when any agent's status leaves `running` and stays non-`running` for 2.5 seconds.

**Architecture:** A renderer-side `useStatusNotification` hook watches all sessions for `running → non-running` transitions, debounces each with a 2.5 s timer, then invokes a new `app:beep` IPC channel that calls `shell.beep()` in the main process. A `notificationSound` boolean in `ManifoldSettings` controls the toggle.

**Tech Stack:** React hooks, Electron IPC, Electron `shell.beep()`, vitest

---

### Task 1: Add `notificationSound` to settings type and defaults

**Files:**
- Modify: `src/shared/types.ts:44-51` (ManifoldSettings interface)
- Modify: `src/shared/defaults.ts:3-10` (DEFAULT_SETTINGS object)

**Step 1: Add the field to ManifoldSettings**

In `src/shared/types.ts`, add `notificationSound` to the interface:

```typescript
export interface ManifoldSettings {
  storagePath: string
  setupCompleted: boolean
  defaultRuntime: string
  theme: string
  scrollbackLines: number
  defaultBaseBranch: string
  notificationSound: boolean
}
```

**Step 2: Set the default value**

In `src/shared/defaults.ts`, add the default:

```typescript
export const DEFAULT_SETTINGS: ManifoldSettings = {
  storagePath: '',
  setupCompleted: false,
  defaultRuntime: 'claude',
  theme: 'dracula',
  scrollbackLines: 5000,
  defaultBaseBranch: 'main',
  notificationSound: true,
}
```

**Step 3: Run typecheck to verify no breakage**

Run: `npm run typecheck`
Expected: PASS (the new field has a default, existing code just spreads partials)

**Step 4: Commit**

```bash
git add src/shared/types.ts src/shared/defaults.ts
git commit -m "feat: add notificationSound setting to ManifoldSettings"
```

---

### Task 2: Register `app:beep` IPC channel

**Files:**
- Modify: `src/main/ipc-handlers.ts:33-44` (registerIpcHandlers function)
- Modify: `src/preload/index.ts:3-37` (ALLOWED_INVOKE_CHANNELS)

**Step 1: Add the IPC handler in main process**

In `src/main/ipc-handlers.ts`, add a new registration call inside `registerIpcHandlers`:

```typescript
import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
```

Then add at the end of `registerIpcHandlers`:

```typescript
  ipcMain.handle('app:beep', () => {
    shell.beep()
  })
```

**Step 2: Whitelist the channel in preload**

In `src/preload/index.ts`, add `'app:beep'` to `ALLOWED_INVOKE_CHANNELS`:

```typescript
const ALLOWED_INVOKE_CHANNELS = [
  // ... existing channels ...
  'git:resolve-conflict',
  'app:beep',
] as const
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/main/ipc-handlers.ts src/preload/index.ts
git commit -m "feat: add app:beep IPC channel for system notification sound"
```

---

### Task 3: Write `useStatusNotification` hook with tests (TDD)

**Files:**
- Create: `src/renderer/hooks/useStatusNotification.test.ts`
- Create: `src/renderer/hooks/useStatusNotification.ts`

**Step 1: Write the failing tests**

Create `src/renderer/hooks/useStatusNotification.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStatusNotification } from './useStatusNotification'
import type { AgentSession } from '../../shared/types'

function makeSession(id: string, status: AgentSession['status']): AgentSession {
  return {
    id,
    projectId: 'proj-1',
    runtimeId: 'claude',
    branchName: 'manifold/test',
    worktreePath: '/tmp/test',
    status,
    pid: status === 'running' ? 1234 : null,
  }
}

describe('useStatusNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.electronAPI = {
      invoke: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      on: vi.fn(() => () => {}),
    } as unknown as typeof window.electronAPI
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not beep when status stays running', () => {
    const sessions = [makeSession('s1', 'running')]
    const { rerender } = renderHook(
      ({ s, enabled }) => useStatusNotification(s, enabled),
      { initialProps: { s: sessions, enabled: true } }
    )
    // Re-render with same status
    rerender({ s: [makeSession('s1', 'running')], enabled: true })
    vi.advanceTimersByTime(3000)
    expect(window.electronAPI.invoke).not.toHaveBeenCalledWith('app:beep')
  })

  it('beeps after 2.5s when status leaves running', () => {
    const { rerender } = renderHook(
      ({ s, enabled }) => useStatusNotification(s, enabled),
      { initialProps: { s: [makeSession('s1', 'running')], enabled: true } }
    )
    // Transition to waiting
    rerender({ s: [makeSession('s1', 'waiting')], enabled: true })
    vi.advanceTimersByTime(2500)
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('app:beep')
  })

  it('cancels beep if status returns to running within window', () => {
    const { rerender } = renderHook(
      ({ s, enabled }) => useStatusNotification(s, enabled),
      { initialProps: { s: [makeSession('s1', 'running')], enabled: true } }
    )
    // Transition to waiting
    rerender({ s: [makeSession('s1', 'waiting')], enabled: true })
    vi.advanceTimersByTime(1000)
    // Back to running before 2.5s
    rerender({ s: [makeSession('s1', 'running')], enabled: true })
    vi.advanceTimersByTime(2000)
    expect(window.electronAPI.invoke).not.toHaveBeenCalledWith('app:beep')
  })

  it('does not beep when disabled', () => {
    const { rerender } = renderHook(
      ({ s, enabled }) => useStatusNotification(s, enabled),
      { initialProps: { s: [makeSession('s1', 'running')], enabled: false } }
    )
    rerender({ s: [makeSession('s1', 'waiting')], enabled: false })
    vi.advanceTimersByTime(3000)
    expect(window.electronAPI.invoke).not.toHaveBeenCalledWith('app:beep')
  })

  it('tracks multiple sessions independently', () => {
    const { rerender } = renderHook(
      ({ s, enabled }) => useStatusNotification(s, enabled),
      {
        initialProps: {
          s: [makeSession('s1', 'running'), makeSession('s2', 'running')],
          enabled: true,
        },
      }
    )
    // Only s1 transitions
    rerender({
      s: [makeSession('s1', 'waiting'), makeSession('s2', 'running')],
      enabled: true,
    })
    vi.advanceTimersByTime(2500)
    expect(window.electronAPI.invoke).toHaveBeenCalledTimes(1)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/hooks/useStatusNotification.test.ts`
Expected: FAIL — module not found

**Step 3: Write the hook implementation**

Create `src/renderer/hooks/useStatusNotification.ts`:

```typescript
import { useEffect, useRef } from 'react'
import type { AgentSession, AgentStatus } from '../../shared/types'

const DEBOUNCE_MS = 2500

export function useStatusNotification(
  sessions: AgentSession[],
  enabled: boolean
): void {
  const prevStatuses = useRef<Map<string, AgentStatus>>(new Map())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    if (!enabled) {
      // Clear any pending timers when disabled
      for (const timer of timers.current.values()) clearTimeout(timer)
      timers.current.clear()
      // Still track statuses so we don't fire stale transitions when re-enabled
      const next = new Map<string, AgentStatus>()
      for (const session of sessions) next.set(session.id, session.status)
      prevStatuses.current = next
      return
    }

    for (const session of sessions) {
      const prev = prevStatuses.current.get(session.id)
      const current = session.status

      if (prev === 'running' && current !== 'running') {
        // Start debounce timer
        if (!timers.current.has(session.id)) {
          const timer = setTimeout(() => {
            timers.current.delete(session.id)
            void window.electronAPI.invoke('app:beep')
          }, DEBOUNCE_MS)
          timers.current.set(session.id, timer)
        }
      }

      if (current === 'running') {
        // Cancel pending timer
        const existing = timers.current.get(session.id)
        if (existing) {
          clearTimeout(existing)
          timers.current.delete(session.id)
        }
      }
    }

    // Update tracked statuses
    const next = new Map<string, AgentStatus>()
    for (const session of sessions) next.set(session.id, session.status)
    prevStatuses.current = next
  })

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer)
    }
  }, [])
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/hooks/useStatusNotification.test.ts`
Expected: PASS (all 5 tests)

**Step 5: Commit**

```bash
git add src/renderer/hooks/useStatusNotification.ts src/renderer/hooks/useStatusNotification.test.ts
git commit -m "feat: add useStatusNotification hook with debounced system beep"
```

---

### Task 4: Wire the hook into App.tsx

**Files:**
- Modify: `src/renderer/App.tsx:1-16` (imports)
- Modify: `src/renderer/App.tsx:29-34` (hook usage area)

**Step 1: Import the hook**

Add to the imports in `App.tsx`:

```typescript
import { useStatusNotification } from './hooks/useStatusNotification'
```

**Step 2: Call the hook**

After line 34 (`const { sessionsByProject, removeSession } = ...`), add:

```typescript
  // Flatten all sessions across projects for notification tracking
  const allSessions = useMemo(
    () => Object.values(sessionsByProject).flat(),
    [sessionsByProject]
  )
  useStatusNotification(allSessions, settings.notificationSound)
```

**Step 3: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: wire useStatusNotification into App"
```

---

### Task 5: Add toggle to SettingsModal

**Files:**
- Modify: `src/renderer/components/SettingsModal.tsx`

**Step 1: Add state for the toggle**

In `SettingsModal`, add state alongside the existing fields (after line 37):

```typescript
  const [notificationSound, setNotificationSound] = useState(settings.notificationSound)
```

**Step 2: Reset on open**

In the `useEffect` that resets state when `visible` changes (line 41-50), add:

```typescript
      setNotificationSound(settings.notificationSound)
```

**Step 3: Include in save**

In `handleSave` (line 52-55), add `notificationSound` to the partial:

```typescript
    onSave({ defaultRuntime, theme, scrollbackLines, defaultBaseBranch, storagePath, notificationSound })
```

**Step 4: Thread through to SettingsBody**

Add prop to `SettingsBodyProps` interface:

```typescript
  notificationSound: boolean
  onNotificationSoundChange: (enabled: boolean) => void
```

Pass it from `SettingsModal`:

```typescript
          notificationSound={notificationSound}
          onNotificationSoundChange={setNotificationSound}
```

**Step 5: Render the checkbox in SettingsBody**

Add after the "Default Base Branch" label block (after line 235):

```tsx
      <label style={{ ...modalStyles.label, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
        <input
          type="checkbox"
          checked={notificationSound}
          onChange={(e) => onNotificationSoundChange(e.target.checked)}
          style={{ width: 'auto', margin: 0 }}
        />
        Play sound when agent stops running
      </label>
```

**Step 6: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: PASS

**Step 7: Commit**

```bash
git add src/renderer/components/SettingsModal.tsx
git commit -m "feat: add notification sound toggle to settings UI"
```

---

### Task 6: Final verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Manual smoke test**

Run: `npm run dev`

1. Open Settings — verify "Play sound when agent stops running" checkbox is visible and checked
2. Spawn an agent — wait for it to enter `running` (blue dot)
3. Let the agent finish — after ~2.5 s, the system notification sound should play
4. Toggle the setting off — repeat, no sound should play
5. Verify brief status flickers (< 2.5 s) do not trigger a sound
