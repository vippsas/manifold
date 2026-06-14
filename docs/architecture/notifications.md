---
description: Native macOS desktop notifications for agent lifecycle transitions — policy, notifier, IPC wiring, and settings.
covers: [src/main/notifications]
updated: 2026-06-14
owner: see .github/CODEOWNERS
---

# Notifications — agent lifecycle desktop notifications

When an agent finishes, needs input, or hits an error, Manifold raises a native macOS
desktop notification. Clicking it brings the app forward and opens the relevant session.
macOS Focus / Do Not Disturb is respected by the OS, so there is no in-app quiet-hours
schedule. The subsystem has two files: a pure policy class that decides *whether* and
*when* to fire, and a notifier that supplies live context and builds the Electron
`Notification`.

## Covered code

- `src/main/notifications/notification-policy.ts` — `NotificationPolicy`: pure decision logic; no Electron deps; unit-tested.
- `src/main/notifications/agent-notifier.ts` — `AgentNotifier`: wires policy to live Electron state and IPC.

Settings type, defaults, and merge:
- `src/shared/types.ts` — `NotificationScope` (line 121), `NotificationSettings` (line 125), `ManifoldSettings.notifications` (line 149).
- `src/shared/defaults.ts` — default values: `enabled: false` (off by default), all events on, `scope: 'non-active'` (line 55).
- `src/main/store/settings-store.ts` — field-level merge in `resolveDefaults()` (line 45).

Renderer settings (its own **Notifications** tab in the Settings modal):
- `src/renderer/components/modals/settings/NotificationSettingsSection.tsx` — rendered as a
  dedicated tab, registered in `SettingsModalBody.tsx` (`SETTINGS_TABS`).

## How it works

### Decision policy (`NotificationPolicy`)

`NotificationPolicy` is constructed with a `fire` callback and a debounce interval
(default 2 000 ms). Its only public method is `observe(input: NotificationObservation)`.
On each call it:

1. **Baselines on first sight** — the very first status seen for a session is recorded but
   no notification is scheduled (`notification-policy.ts:63`). This avoids firing for
   sessions that are already done when the app starts.
2. **Dedupes** — if the status has not changed, no-ops (`notification-policy.ts:64`).
3. **Cancels any pending timer** for the session (`notification-policy.ts:57`). This
   suppresses the regex-detected `error` flicker: a rapid `running → error → running`
   transition never fires because each new transition clears the previous debounce.
4. **Gates on** (in order): the status must be in `{done, waiting, error}`
   (`notification-policy.ts:65`); the master `enabled` toggle (`notification-policy.ts:68`);
   the per-event toggle (`onDone` / `onWaiting` / `onError`, `notification-policy.ts:69`);
   the scope predicate (`notification-policy.ts:70`).
5. **Schedules** a debounced `fire(sessionId, status)` call
   (`notification-policy.ts:72`).

**Scope predicate** (`passesScope`, `notification-policy.ts:22`): `'always'` never
suppresses; `'unfocused'` suppresses when the window is focused; `'non-active'` (the
default) suppresses only when the window is focused *and* the session being viewed is the
one that transitioned — so background sessions still notify even when Manifold is in
focus.

`forget(sessionId)` cancels any pending timer and clears the baseline for a session
(called when a session is deleted, `notification-policy.ts:80`).

### Notifier (`AgentNotifier`)

`AgentNotifier` owns a `NotificationPolicy` instance and supplies the live context the
policy needs (`agent-notifier.ts:37`):

- `isWindowFocused()` — delegates to `mainWindow.isFocused()` (injected dep).
- `activeSessionId` — kept up to date via `setActiveSessionId()`, driven by the
  `notifications:active-session` IPC message from the renderer.

**`onStatus(sessionId, status)`** (`agent-notifier.ts:50`) is the hook called by
`SessionManager` on every `agent:status` transition. It reads the current settings
snapshot and forwards to `policy.observe(...)`.

**`show(sessionId, status)`** (`agent-notifier.ts:62`) is the `fire` callback. It
re-checks the master `enabled` toggle at fire time (the user may have turned off
notifications during the 2 s debounce window), resolves session info via
`resolveSession`, builds the `Notification` with:

- Title: `'Agent finished'` / `'Agent needs input'` / `'Agent hit an error'`
  (`agent-notifier.ts:22`).
- Body: `session.displayName || session.taskDescription || session.branchName`.

The notification's `click` handler calls `revealSession(projectId, sessionId)`.

### Status source / hook (`SessionManager`)

`SessionManager.sendToRenderer()` fans every `agent:status` message to all registered
listeners (`session-manager.ts:171`). After the verdict recorder hook, it calls
`this.notificationService?.onStatus(payload.sessionId, payload.status)`
(`session-manager.ts:177`). The notifier is injected via
`setNotificationService(agentNotifier)` (`session-manager.ts:167`).

### App wiring (`src/main/app/index.ts`)

`AgentNotifier` is constructed at line 112 with four injected deps:

- `getSettings` — reads the live `SettingsStore`.
- `isWindowFocused` — `() => mainWindow?.isFocused() ?? false` (`app/index.ts:114`).
- `resolveSession` — calls `sessionManager.getInternalSession()` and extracts
  `displayName`, `taskDescription`, `branchName`, `projectId` (`app/index.ts:115`).
- `revealSession` — restores/focuses `mainWindow` and sends
  `notification:open-session` to the renderer (`app/index.ts:125`).

`sessionManager.setNotificationService(agentNotifier)` wires the hook
(`app/index.ts:133`).

`ipcMain.on('notifications:active-session', ...)` receives the active session id from
the renderer and calls `agentNotifier.setActiveSessionId(...)` (`app/index.ts:134`).

### IPC channels and renderer

Two channels are allowlisted in `src/preload/index.ts`:

- **Send** (renderer → main): `'notifications:active-session'` (`preload/index.ts:136`) —
  renderer pushes the currently viewed session id whenever it changes.
- **Listen** (main → renderer): `'notification:open-session'` (`preload/index.ts:167`) —
  main pushes `{ projectId, sessionId }` when the user clicks a notification.

In `src/renderer/hooks/useAppEffects.ts`:

- A `useEffect` on `activeSessionId` sends the session id to main via
  `window.electronAPI.send('notifications:active-session', ...)` (`useAppEffects.ts:83`).
- A `useEffect` listens for `'notification:open-session'` and calls `setActiveSession`,
  `setActiveProject`, and `dockLayout.openSiblingPanel(sessionId)` to surface the session
  (`useAppEffects.ts:87`).

### Settings

`ManifoldSettings.notifications` (`NotificationSettings`) carries five fields: `enabled`,
`onDone`, `onWaiting`, `onError`, `scope`. The master `enabled` flag defaults to `false`
(notifications are off until the user opts in); the per-event flags default to on with
`scope: 'non-active'` (`defaults.ts:55`). `resolveDefaults()` in `settings-store.ts` spreads the stored value
over the defaults field-by-field (`settings-store.ts:45`) so a config written before this
field existed gets the defaults on next load. The UI card
`NotificationSettingsSection.tsx` exposes a master toggle, per-event checkboxes, a
scope selector, and the "Play sound when agent stops running" toggle (`notificationSound`).

## Interactions

- **`SessionManager`** (`src/main/session/session-manager.ts`) — calls
  `notificationService.onStatus()` inside `sendToRenderer` on every `agent:status`
  transition alongside the verdict recorder.
- **`SettingsStore`** (`src/main/store/settings-store.ts`) — settings are re-read on
  every `observe()` call and again at `show()` fire time so setting changes take effect
  without a restart.
- **App bootstrap** (`src/main/app/index.ts`) — constructs and wires `AgentNotifier` after
  `SessionManager` is initialized.
- **Renderer** (`src/renderer/hooks/useAppEffects.ts`) — two-way IPC: pushes active
  session id to main, receives open-session commands from main.

## Invariants & gotchas

- **Pure policy, Electron-free.** `NotificationPolicy` carries no Electron imports, making
  it straightforwardly unit-testable with fake timers (`notification-policy.test.ts`).
- **Debounce suppresses flicker, not delays.** The 2 s window exists to absorb the
  regex-detected `error` state that appears and disappears quickly in normal operation.
  Any new transition for the same session cancels the pending fire entirely.
- **Double-checked `enabled`.** The policy evaluates `enabled` at `observe()` time; the
  notifier re-checks it at `show()` time. A disable during the debounce window is always
  honoured.
- **Baseline-on-first-sight prevents startup storms.** Sessions already in a terminal
  state when the app starts are silenced — the first observed status sets the baseline
  without firing.
- **macOS only in practice.** `Notification.isSupported()` is checked before every
  `show()` call (`agent-notifier.ts:63`), so the code is safe on platforms where
  Electron notifications are unavailable.
