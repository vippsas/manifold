# Status Notification Sound

## Problem

When an agent finishes a task (status leaves `running`), the user has no audible cue. They must visually check the sidebar indicator. Agents sometimes flicker briefly out of `running` and back, so a naive approach would produce false pings.

## Design

### Approach

Renderer-side hook with debounced timer. When any session transitions from `running` to a non-`running` status, a 2.5 s timer starts. If the session hasn't returned to `running` by then, the system notification sound plays via Electron's `shell.beep()`.

### Data Flow

```
SessionManager emits agent:status
  → useStatusListener updates sessions[]
  → useStatusNotification observes sessions[]
  → detects running → non-running per session
  → starts 2.5 s timer
  → if still non-running: invoke('app:beep') → main calls shell.beep()
```

### Components

| Component | Change |
|-----------|--------|
| `ManifoldSettings` (shared/types.ts) | Add `notificationSound: boolean` |
| `DEFAULT_SETTINGS` (shared/defaults.ts) | Add `notificationSound: true` |
| `app:beep` IPC channel | New invoke channel; main handler calls `shell.beep()` |
| `preload/index.ts` | Whitelist `app:beep` in invoke channels |
| `ipc-handlers.ts` | Register `app:beep` handler |
| `useStatusNotification` hook | New renderer hook |
| `App.tsx` or `useAgentSession.ts` | Consume the hook |
| Settings UI | Add toggle for "Notification sound" |

### Hook Logic (useStatusNotification)

```
useStatusNotification(sessions: AgentSession[], soundEnabled: boolean)

  prevStatuses = useRef<Map<string, AgentStatus>>()
  timers = useRef<Map<string, NodeJS.Timeout>>()

  useEffect:
    for each session:
      prev = prevStatuses.get(session.id)
      current = session.status

      if prev === 'running' && current !== 'running':
        start 2500 ms timer → invoke('app:beep')

      if current === 'running':
        cancel pending timer for session.id

      prevStatuses.set(session.id, current)

    cleanup: clear all timers on unmount
```

Key behaviors:
- Each session tracked independently
- Timer cancelled if session returns to `running` within the debounce window
- No sound when `soundEnabled` is `false`
- Timers cleaned up on hook unmount
- Sessions removed from tracking when they leave the sessions array

### Settings

One new toggle in the existing settings panel: **"Play sound when agent stops running"**, bound to `notificationSound`.
