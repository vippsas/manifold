# Desktop Notifications for Agent Lifecycle (done / needs input / error) — Design

Implements [#723](https://github.com/vippsas/manifold/issues/723).

## Goal

Fire a native macOS notification when an agent session transitions to **done**,
**waiting** (needs input), or **error**, so unattended and background work is
visible without staring at the app. Clicking a notification focuses Manifold and
opens that session. Per-event and global toggles live in Settings and persist
across restarts.

## Approach

Main-process driven. A single new `AgentNotificationService` is hooked into the
one place every status change already passes through —
`SessionManager.sendToRenderer` (`src/main/session/session-manager.ts:165-186`),
right beside the existing `verdictRecorder.onStatus(...)` fan-out. No edits to
the dozen scattered transition sites.

Rejected alternatives:
- **Renderer-driven notifications** (Web Notification API): the renderer only
  holds sessions for the *active* project, so cross-project session metadata and
  click-through project switching are awkward; and app-focus on click is
  unreliable from the renderer. Main has the global session registry and owns
  the window.
- **Hijacking `SessionManager.setStatusListener`** (the single generic listener
  slot): risk of colliding with a future/other consumer. A dedicated hook beside
  `verdictRecorder` is clearer.
- **Custom quiet-hours scheduler**: native macOS notifications already honor
  system Focus / Do-Not-Disturb. Building our own is needless scope (confirmed
  with user).

## Data flow

```
PTY output → detectStatus → session.status = X
  → SessionManager.sendToRenderer('agent:status', {sessionId, status})
      ├→ verdictRecorder.onStatus(...)             (existing)
      ├→ notificationService.onStatus(sessionId, status)   (NEW)
      └→ mainWindow.webContents.send('agent:status', ...)  (existing → renderer)

notificationService.onStatus
  → policy decides (baseline / dedupe / scope / event-toggle / debounce)
  → schedule debounced fire; cancel if status changes again
  → new Notification({title, body}).show()
      on 'click': mainWindow.show() + focus()
                  → webContents.send('notification:open-session', {projectId, sessionId})

renderer (useAppEffects) on 'notification:open-session'
  → setActiveProject(projectId) → setActiveSession(sessionId)
  → dockLayout.openSiblingPanel(sessionId)

renderer activeSessionId changes
  → electronAPI.send('notifications:active-session', sessionId)  (NEW send channel)
  → main caches it for the 'non-active' scope check
```

## Components

Split into two units so the policy is unit-testable without Electron.

### 1. Policy — `src/main/notifications/notification-policy.ts` (pure)

`decideNotification(input) → { fire: boolean }` and a small stateful
`NotificationPolicy` class holding per-session last-seen status + debounce
timers. Inputs: `(sessionId, newStatus, settings.notifications, windowFocused,
activeSessionId)`. Rules, in order:

1. **Master / support gate:** `settings.notifications.enabled` must be true.
2. **Baseline-on-first-sight:** the first status ever observed for a session
   records a silent baseline and never fires. Prevents a startup/discovery burst
   (dormant sessions are first seen as `waiting`/`done`).
3. **Notify-worthy + event toggle:** status ∈ {`done`,`waiting`,`error`} and the
   matching toggle (`onDone`/`onWaiting`/`onError`) is on.
4. **Dedupe:** fire only when the status *changed* from the last seen value;
   never re-fire the same status.
5. **Scope:**
   - `non-active` (default): fire if `!windowFocused || sessionId !== activeSessionId`
   - `unfocused`: fire if `!windowFocused`
   - `always`: always
6. **Debounce ~2s, cancel-on-change:** schedule the fire; any subsequent status
   transition for that session cancels a pending fire. A transient regex-detected
   `error:` that keeps streaming flips back to `running` on the next chunk and
   cancels itself — only a *stable* state fires. (`done` is a terminal PTY exit;
   kept on the same uniform path for simplicity.)

The last-seen status is updated on every observation (so dedupe/baseline track
the true latest), independent of whether a fire was scheduled.

### 2. Notifier — `src/main/notifications/agent-notifier.ts` (Electron side-effect)

Owns the policy instance and the Electron wrapper. Constructed in
`src/main/app/index.ts` wiring with dependency getters:
`getSettings()`, `() => mainWindow?.isFocused() ?? false`,
`getActiveSessionId()`, `resolveSession(id)` (→ `SessionManager.getInternalSession`),
and a `revealSession(projectId, sessionId)` callback that shows+focuses the
window and sends `notification:open-session`. Guards on
`Notification.isSupported()`. Body copy:

| status   | title                  | body              |
|----------|------------------------|-------------------|
| done     | "Agent finished"       | `<session name>`  |
| waiting  | "Agent needs input"    | `<session name>`  |
| error    | "Agent hit an error"   | `<session name>`  |

`session name = displayName || taskDescription || branchName`.

`SessionManager` gains a `setNotificationService(svc)` setter and calls
`this.notificationService?.onStatus(...)` inside `sendToRenderer` next to the
verdict-recorder call. Active-session id is held by the notifier (set via a new
IPC handler), not by `SessionManager`.

## Settings

New nested object on `ManifoldSettings` (`src/shared/types.ts`):

```ts
notifications: {
  enabled: boolean   // master toggle            (default true)
  onDone: boolean    //                          (default true)
  onWaiting: boolean //                          (default true)
  onError: boolean   //                          (default true)
  scope: 'non-active' | 'unfocused' | 'always'   // (default 'non-active')
}
```

Defaults added to `src/shared/defaults.ts`. Persists via the existing whole-file
`SettingsStore` merge — no store-class changes. The existing flat
`notificationSound` (the sound beep) is left untouched; this is a separate
visual-notification feature.

### IPC

- New send channel `notifications:active-session` (renderer → main), added to
  `ALLOWED_SEND_CHANNELS` in `src/preload/index.ts`; handled in main to update
  the notifier's cached active-session id. Renderer fires it from an effect on
  `activeSessionId` change.
- New listen channel `notification:open-session` (main → renderer), added to
  `ALLOWED_LISTEN_CHANNELS`; handled in `useAppEffects` (mirrors the existing
  `plugins:reveal-session` handler) to switch project + active session + open the
  sibling panel.

### UI

A "Desktop notifications" card in **Settings → General**: master checkbox, three
event checkboxes (disabled/greyed when master is off), and a scope `<select>`
(Non-active session / When app unfocused / Always). To respect the 300-LOC file
limit, extracted into `NotificationSettingsSection.tsx` and rendered by the
General tab; wired through `SettingsModal` local state like other settings.

## Error handling

- `Notification.isSupported()` false → no-op (Linux/edge cases).
- `resolveSession` returns undefined (session gone) → skip the notification.
- All notifier work is best-effort; failures never disrupt the status pipeline.

## Testing

- **Policy unit tests** (`vitest` fake timers, no Electron): baseline-no-fire,
  dedupe, each scope (`non-active`/`unfocused`/`always`), each event toggle,
  master-off, debounce-cancel-on-flicker, error-flicker suppression.
- **Settings**: defaults present; partial update round-trips and persists.
- Gates: `npm run typecheck:web` and `npm run typecheck:node` green; full test
  suite passes.

## Non-goals (v1)

- Coalescing bursts (native macOS stacks notifications).
- Third-party push (Slack / email).
- Custom quiet-hours scheduler (system Focus/DND is honored natively).
