# Agent Lifecycle Desktop Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fire native macOS notifications when an agent session transitions to `done`, `waiting` (needs input), or `error`; clicking a notification focuses Manifold and opens that session; per-event + global toggles and a scope selector live in Settings and persist across restarts.

**Architecture:** Main-process driven. A pure `NotificationPolicy` (baseline / dedupe / scope / event-toggle / debounce) decides whether to fire; a thin `AgentNotifier` wraps Electron's `Notification` and the click handler. Both are driven from the single choke point `SessionManager.sendToRenderer` (next to the existing `verdictRecorder.onStatus`). The renderer reports the active session id to main and handles the click-through.

**Tech Stack:** TypeScript, Electron 39 (`Notification` API), React (renderer), vitest (fake timers for the policy). Settings persist via the existing whole-file `SettingsStore`.

**Spec:** `docs/superpowers/specs/2026-06-14-agent-lifecycle-notifications-design.md`

**Conventions:**
- Run tests with `npm test` (never `npx vitest` — the `pretest` hook rebuilds `better-sqlite3`). One file: `npm test -- path/to/file.test.ts`.
- Type gates: `npm run typecheck:web` (must be **0 errors** — green gate) and `npm run typecheck:node` (has a pre-existing baseline of masked declaration errors; the gate is **no new errors from the files you touch**).
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- `notifications` is **optional** on `ManifoldSettings` (a full settings literal in `plugin-manager.test.ts:17` would break if it were required); it is always present in `DEFAULT_SETTINGS` and filled by the store, so reads guard with `?? DEFAULT_SETTINGS.notifications`.

---

## File Structure

**Create:**
- `src/main/notifications/notification-policy.ts` — pure decision engine (baseline, dedupe, scope, event toggles, debounce).
- `src/main/notifications/notification-policy.test.ts` — unit tests (fake timers).
- `src/main/notifications/agent-notifier.ts` — owns a policy + the Electron `Notification` side-effect and click handler.
- `src/renderer/components/modals/settings/NotificationSettingsSection.tsx` — the "Desktop Notifications" settings card.
- `docs/architecture/notifications.md` — architecture page for the new subsystem.

**Modify:**
- `src/shared/types.ts` — `NotificationScope`, `NotificationSettings`, `notifications?` on `ManifoldSettings`.
- `src/shared/defaults.ts` — default `notifications` object.
- `src/main/store/settings-store.ts` — nested field-level default merge in `resolveDefaults`.
- `src/main/store/settings-store.test.ts` — tests for the new default merge.
- `src/main/session/session-manager.ts` — `setNotificationService` + `onStatus` fan-out in `sendToRenderer`.
- `src/main/app/index.ts` — construct + wire `AgentNotifier`; register `notifications:active-session` ipc handler.
- `src/preload/index.ts` — allow new send/listen channels.
- `src/renderer/hooks/useAppEffects.ts` — report active session to main; handle `notification:open-session`.
- `src/renderer/App.tsx` — pass `setActiveSession` into `useAppEffects`.
- `src/renderer/components/modals/SettingsModal.tsx` — local `notifications` state + save.
- `src/renderer/components/modals/settings/SettingsModalBody.tsx` — thread the 2 new props.
- `src/renderer/components/modals/settings/GeneralSettingsSection.tsx` — render the new card.
- `docs/README.md` — add the new page to the doc map.

---

## Task 1: Settings type, defaults, and store merge

**Files:**
- Modify: `src/shared/types.ts` (after line 119, before `ManifoldSettings`; and a field inside `ManifoldSettings`)
- Modify: `src/shared/defaults.ts:52-54`
- Modify: `src/main/store/settings-store.ts:38-41`
- Test: `src/main/store/settings-store.test.ts` (add inside the `describe('defaults', ...)` block, ~line 197)

- [ ] **Step 1: Add the types**

In `src/shared/types.ts`, immediately **before** `export interface ManifoldSettings {` (currently line 121), add:

```ts
export type NotificationScope = 'non-active' | 'unfocused' | 'always'

/** Desktop (OS) notifications for agent lifecycle transitions. macOS Focus / DND
 *  is respected natively, so there is no in-app quiet-hours schedule. */
export interface NotificationSettings {
  /** Master switch for all desktop notifications. */
  enabled: boolean
  /** Notify when a session transitions to `done`. */
  onDone: boolean
  /** Notify when a session transitions to `waiting` (needs input). */
  onWaiting: boolean
  /** Notify when a session transitions to `error`. */
  onError: boolean
  /** Which sessions raise a notification. */
  scope: NotificationScope
}
```

Then, inside `ManifoldSettings`, add this line directly after `notificationSound: boolean` (currently line 131):

```ts
  notifications?: NotificationSettings
```

- [ ] **Step 2: Add the defaults**

In `src/shared/defaults.ts`, add this block directly after the `transcription: { provider: 'none' },` block (currently line 52-54), before `pluginConfig: {},`:

```ts
  notifications: {
    enabled: true,
    onDone: true,
    onWaiting: true,
    onError: true,
    scope: 'non-active',
  },
```

- [ ] **Step 3: Add the nested default merge in the store**

In `src/main/store/settings-store.ts`, in `resolveDefaults`, directly after the `settings.editor = { ... } as ManifoldSettings['editor']` block (currently ends line 41), add:

```ts
    settings.notifications = {
      ...DEFAULT_SETTINGS.notifications,
      ...settings.notifications,
    } as ManifoldSettings['notifications']
```

- [ ] **Step 4: Write the failing store tests**

In `src/main/store/settings-store.test.ts`, inside `describe('defaults', () => { ... })`, after the existing `'deep-merges partial editor settings with defaults'` test (currently ends line 197), add:

```ts
    it('fills in default notification settings when absent', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new SettingsStore()
      expect(store.getSettings().notifications).toEqual(DEFAULT_SETTINGS.notifications)
    })

    it('deep-merges partial notification settings with defaults', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ notifications: { onWaiting: false } }))

      const store = new SettingsStore()
      const n = store.getSettings().notifications
      expect(n?.onWaiting).toBe(false)
      expect(n?.enabled).toBe(DEFAULT_SETTINGS.notifications?.enabled)
      expect(n?.onDone).toBe(DEFAULT_SETTINGS.notifications?.onDone)
      expect(n?.onError).toBe(DEFAULT_SETTINGS.notifications?.onError)
      expect(n?.scope).toBe(DEFAULT_SETTINGS.notifications?.scope)
    })
```

- [ ] **Step 5: Run the store tests**

Run: `npm test -- src/main/store/settings-store.test.ts`
Expected: PASS — all existing tests (the `toEqual(RESOLVED_DEFAULTS)` ones still pass because `RESOLVED_DEFAULTS` spreads `DEFAULT_SETTINGS`, which now includes `notifications`, and the merge produces a deep-equal object) plus the 2 new tests.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck:web && npm run typecheck:node`
Expected: `typecheck:web` 0 errors. `typecheck:node` no new errors referencing `types.ts`, `defaults.ts`, or `settings-store.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/shared/defaults.ts src/main/store/settings-store.ts src/main/store/settings-store.test.ts
git commit -m "feat(#723): add notification settings type, defaults, and store merge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: The notification policy (pure, TDD)

**Files:**
- Create: `src/main/notifications/notification-policy.ts`
- Test: `src/main/notifications/notification-policy.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/notifications/notification-policy.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NotificationPolicy } from './notification-policy'
import type { NotificationSettings } from '../../shared/types'

const ON: NotificationSettings = { enabled: true, onDone: true, onWaiting: true, onError: true, scope: 'always' }

function makePolicy(debounceMs = 2000): {
  policy: NotificationPolicy
  fired: Array<{ sessionId: string; status: string }>
} {
  const fired: Array<{ sessionId: string; status: string }> = []
  const policy = new NotificationPolicy((sessionId, status) => fired.push({ sessionId, status }), debounceMs)
  return { policy, fired }
}

describe('NotificationPolicy', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not fire on the first observed status (baseline)', () => {
    const { policy, fired } = makePolicy()
    policy.observe({ sessionId: 's1', newStatus: 'waiting', settings: ON, windowFocused: false, activeSessionId: null })
    vi.runAllTimers()
    expect(fired).toEqual([])
  })

  it('fires once on a transition to a notify-worthy status after the debounce', () => {
    const { policy, fired } = makePolicy()
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: ON, windowFocused: false, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'waiting', settings: ON, windowFocused: false, activeSessionId: null })
    expect(fired).toEqual([])
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([{ sessionId: 's1', status: 'waiting' }])
  })

  it('does not re-fire when the same status is observed again', () => {
    const { policy, fired } = makePolicy()
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: ON, windowFocused: false, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'waiting', settings: ON, windowFocused: false, activeSessionId: null })
    vi.advanceTimersByTime(2000)
    policy.observe({ sessionId: 's1', newStatus: 'waiting', settings: ON, windowFocused: false, activeSessionId: null })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([{ sessionId: 's1', status: 'waiting' }])
  })

  it('cancels a pending notification when status flips back before the debounce (error flicker)', () => {
    const { policy, fired } = makePolicy()
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: ON, windowFocused: false, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'error', settings: ON, windowFocused: false, activeSessionId: null })
    vi.advanceTimersByTime(500)
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: ON, windowFocused: false, activeSessionId: null })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([])
  })

  it('respects the master enabled toggle', () => {
    const { policy, fired } = makePolicy()
    const off = { ...ON, enabled: false }
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: off, windowFocused: false, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'done', settings: off, windowFocused: false, activeSessionId: null })
    vi.runAllTimers()
    expect(fired).toEqual([])
  })

  it('respects a per-event toggle (onWaiting off suppresses waiting, not done)', () => {
    const { policy, fired } = makePolicy()
    const s = { ...ON, onWaiting: false }
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: s, windowFocused: false, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'waiting', settings: s, windowFocused: false, activeSessionId: null })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([])
    policy.observe({ sessionId: 's1', newStatus: 'done', settings: s, windowFocused: false, activeSessionId: null })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([{ sessionId: 's1', status: 'done' }])
  })

  it("scope 'unfocused' suppresses while the window is focused", () => {
    const { policy, fired } = makePolicy()
    const s = { ...ON, scope: 'unfocused' as const }
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: s, windowFocused: true, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'done', settings: s, windowFocused: true, activeSessionId: null })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([])
  })

  it("scope 'non-active' suppresses the focused active session, notifies others", () => {
    const { policy, fired } = makePolicy()
    const s = { ...ON, scope: 'non-active' as const }
    policy.observe({ sessionId: 'active', newStatus: 'running', settings: s, windowFocused: true, activeSessionId: 'active' })
    policy.observe({ sessionId: 'active', newStatus: 'done', settings: s, windowFocused: true, activeSessionId: 'active' })
    policy.observe({ sessionId: 'bg', newStatus: 'running', settings: s, windowFocused: true, activeSessionId: 'active' })
    policy.observe({ sessionId: 'bg', newStatus: 'done', settings: s, windowFocused: true, activeSessionId: 'active' })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([{ sessionId: 'bg', status: 'done' }])
  })

  it("scope 'non-active' notifies the active session when the window is unfocused", () => {
    const { policy, fired } = makePolicy()
    const s = { ...ON, scope: 'non-active' as const }
    policy.observe({ sessionId: 'active', newStatus: 'running', settings: s, windowFocused: false, activeSessionId: 'active' })
    policy.observe({ sessionId: 'active', newStatus: 'done', settings: s, windowFocused: false, activeSessionId: 'active' })
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([{ sessionId: 'active', status: 'done' }])
  })

  it('forget() drops pending timers and baseline for a session', () => {
    const { policy, fired } = makePolicy()
    policy.observe({ sessionId: 's1', newStatus: 'running', settings: ON, windowFocused: false, activeSessionId: null })
    policy.observe({ sessionId: 's1', newStatus: 'done', settings: ON, windowFocused: false, activeSessionId: null })
    policy.forget('s1')
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/main/notifications/notification-policy.test.ts`
Expected: FAIL — cannot find module `./notification-policy`.

- [ ] **Step 3: Write the policy**

Create `src/main/notifications/notification-policy.ts`:

```ts
import type { AgentStatus, NotificationScope, NotificationSettings } from '../../shared/types'

export type NotifiableStatus = 'done' | 'waiting' | 'error'

export interface NotificationObservation {
  sessionId: string
  newStatus: AgentStatus
  settings: NotificationSettings
  windowFocused: boolean
  activeSessionId: string | null
}

const NOTIFIABLE: ReadonlySet<AgentStatus> = new Set<AgentStatus>(['done', 'waiting', 'error'])
const DEFAULT_DEBOUNCE_MS = 2000

function isEventEnabled(status: NotifiableStatus, settings: NotificationSettings): boolean {
  if (status === 'done') return settings.onDone
  if (status === 'waiting') return settings.onWaiting
  return settings.onError
}

function passesScope(
  scope: NotificationScope,
  sessionId: string,
  windowFocused: boolean,
  activeSessionId: string | null,
): boolean {
  if (scope === 'always') return true
  if (scope === 'unfocused') return !windowFocused
  // 'non-active': suppress only when the window is focused AND this exact
  // session is the one being viewed.
  return !windowFocused || sessionId !== activeSessionId
}

/**
 * Decides whether an agent status transition should raise a desktop
 * notification, and when. Pure except for debounce timers: it calls `fire`
 * after a quiet window, cancelling if the session's status changes again
 * (suppresses the regex-detected `error` flicker). Holds no Electron deps so it
 * is unit-testable with fake timers.
 */
export class NotificationPolicy {
  private lastStatus = new Map<string, AgentStatus>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private fire: (sessionId: string, status: NotifiableStatus) => void,
    private debounceMs: number = DEFAULT_DEBOUNCE_MS,
  ) {}

  observe(input: NotificationObservation): void {
    const { sessionId, newStatus } = input
    const prev = this.lastStatus.get(sessionId)
    this.lastStatus.set(sessionId, newStatus)

    // Any new transition cancels a pending fire for this session.
    const pending = this.timers.get(sessionId)
    if (pending) {
      clearTimeout(pending)
      this.timers.delete(sessionId)
    }

    if (prev === undefined) return            // baseline on first sight
    if (prev === newStatus) return            // dedupe
    if (!NOTIFIABLE.has(newStatus)) return
    const status = newStatus as NotifiableStatus
    if (!input.settings.enabled) return
    if (!isEventEnabled(status, input.settings)) return
    if (!passesScope(input.settings.scope, sessionId, input.windowFocused, input.activeSessionId)) return

    const timer = setTimeout(() => {
      this.timers.delete(sessionId)
      this.fire(sessionId, status)
    }, this.debounceMs)
    this.timers.set(sessionId, timer)
  }

  /** Drop a session's pending timer and baseline (e.g. session deleted). */
  forget(sessionId: string): void {
    const pending = this.timers.get(sessionId)
    if (pending) {
      clearTimeout(pending)
      this.timers.delete(sessionId)
    }
    this.lastStatus.delete(sessionId)
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/main/notifications/notification-policy.test.ts`
Expected: PASS — all 11 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck:node`
Expected: no new errors referencing `notification-policy.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/main/notifications/notification-policy.ts src/main/notifications/notification-policy.test.ts
git commit -m "feat(#723): notification decision policy with debounce + dedupe

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: The Electron notifier

**Files:**
- Create: `src/main/notifications/agent-notifier.ts`

- [ ] **Step 1: Write the notifier**

Create `src/main/notifications/agent-notifier.ts`:

```ts
import { Notification } from 'electron'
import type { AgentStatus, ManifoldSettings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/defaults'
import { NotificationPolicy, type NotifiableStatus } from './notification-policy'

/** The session fields the notifier needs to build + route a notification. */
export interface NotifierSessionInfo {
  displayName?: string
  taskDescription?: string
  branchName: string
  projectId: string
}

export interface AgentNotifierDeps {
  getSettings: () => ManifoldSettings
  isWindowFocused: () => boolean
  resolveSession: (sessionId: string) => NotifierSessionInfo | undefined
  /** Bring the app forward and open the given session. */
  revealSession: (projectId: string, sessionId: string) => void
}

const TITLES: Record<NotifiableStatus, string> = {
  done: 'Agent finished',
  waiting: 'Agent needs input',
  error: 'Agent hit an error',
}

/**
 * Raises native OS notifications for agent lifecycle transitions. The decision
 * logic lives in NotificationPolicy; this class supplies live focus/active-session
 * context, builds the Electron Notification, and wires its click to revealSession.
 */
export class AgentNotifier {
  private activeSessionId: string | null = null
  private readonly policy: NotificationPolicy

  constructor(private deps: AgentNotifierDeps) {
    this.policy = new NotificationPolicy((sessionId, status) => this.show(sessionId, status))
  }

  setActiveSessionId(sessionId: string | null): void {
    this.activeSessionId = sessionId
  }

  /** Hook for SessionManager — called for every agent:status transition. */
  onStatus(sessionId: string, status: string): void {
    const settings = this.deps.getSettings().notifications ?? DEFAULT_SETTINGS.notifications
    this.policy.observe({
      sessionId,
      newStatus: status as AgentStatus,
      settings,
      windowFocused: this.deps.isWindowFocused(),
      activeSessionId: this.activeSessionId,
    })
  }

  private show(sessionId: string, status: NotifiableStatus): void {
    if (!Notification.isSupported()) return
    const info = this.deps.resolveSession(sessionId)
    if (!info) return
    const name = info.displayName || info.taskDescription || info.branchName
    const notification = new Notification({ title: TITLES[status], body: name })
    notification.on('click', () => this.deps.revealSession(info.projectId, sessionId))
    notification.show()
  }
}
```

Note: `DEFAULT_SETTINGS.notifications` is concrete (the literal is `satisfies ManifoldSettings`), so the `?? DEFAULT_SETTINGS.notifications` fallback yields a non-optional `NotificationSettings` — no `!` needed.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:node`
Expected: no new errors referencing `agent-notifier.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/main/notifications/agent-notifier.ts
git commit -m "feat(#723): Electron agent notifier wrapping the policy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Hook the notifier into SessionManager

**Files:**
- Modify: `src/main/session/session-manager.ts:161-172`

- [ ] **Step 1: Add the service field + setter**

In `src/main/session/session-manager.ts`, directly after the existing `statusListener` declaration + setter (currently lines 161-163), add:

```ts
  private notificationService: { onStatus: (sessionId: string, status: string) => void } | null = null

  setNotificationService(service: { onStatus: (sessionId: string, status: string) => void }): void {
    this.notificationService = service
  }
```

- [ ] **Step 2: Fan out to the notifier in sendToRenderer**

In the same file, in `sendToRenderer`, inside the `if (channel === 'agent:status')` block, add the notifier call after the `verdictRecorder` line. The block currently reads:

```ts
      if (payload?.sessionId && payload.status) {
        this.statusListener?.(payload.sessionId, payload.status)
        this.verdictRecorder?.onStatus(payload.sessionId, payload.status)
      }
```

Change it to:

```ts
      if (payload?.sessionId && payload.status) {
        this.statusListener?.(payload.sessionId, payload.status)
        this.verdictRecorder?.onStatus(payload.sessionId, payload.status)
        this.notificationService?.onStatus(payload.sessionId, payload.status)
      }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:node`
Expected: no new errors referencing `session-manager.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/main/session/session-manager.ts
git commit -m "feat(#723): fan out agent status transitions to the notifier

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wire the notifier in the app entry + active-session IPC

**Files:**
- Modify: `src/main/app/index.ts:1` (import), `:43-48` (import + after verdict wiring ~line 109)

- [ ] **Step 1: Add imports**

In `src/main/app/index.ts`, change the first import line:

```ts
import { app, BrowserWindow, nativeTheme } from 'electron'
```

to:

```ts
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
```

Then add this import alongside the other module imports (e.g. after line 46, the `registerWebviewSchemePrivileged` import):

```ts
import { AgentNotifier } from '../notifications/agent-notifier'
```

- [ ] **Step 2: Construct + wire the notifier**

In `src/main/app/index.ts`, directly after the verdict-recorder wiring block (currently `fileWatcher.setVerdictRecorder(verdictRecorder)` on line 109), add:

```ts
const agentNotifier = new AgentNotifier({
  getSettings: () => settingsStore.getSettings(),
  isWindowFocused: () => mainWindow?.isFocused() ?? false,
  resolveSession: (sessionId) => {
    const session = sessionManager.getInternalSession(sessionId)
    if (!session) return undefined
    return {
      displayName: session.displayName,
      taskDescription: session.taskDescription,
      branchName: session.branchName,
      projectId: session.projectId,
    }
  },
  revealSession: (projectId, sessionId) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('notification:open-session', { projectId, sessionId })
  },
})
sessionManager.setNotificationService(agentNotifier)
ipcMain.on('notifications:active-session', (_event, sessionId: unknown) => {
  agentNotifier.setActiveSessionId(typeof sessionId === 'string' ? sessionId : null)
})
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:node`
Expected: no new errors referencing `index.ts`. (`getInternalSession` exists at `session-manager.ts:239` and returns `InternalSession | undefined` with `displayName`, `taskDescription`, `branchName`, `projectId`.)

- [ ] **Step 4: Commit**

```bash
git add src/main/app/index.ts
git commit -m "feat(#723): construct + wire the agent notifier in the app entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Allow the new IPC channels in preload

**Files:**
- Modify: `src/preload/index.ts:134-136` (send), `:138-166` (listen)

- [ ] **Step 1: Add the send channel**

In `src/preload/index.ts`, change the `ALLOWED_SEND_CHANNELS` array (currently lines 134-136):

```ts
const ALLOWED_SEND_CHANNELS = [
  'theme:changed',
] as const
```

to:

```ts
const ALLOWED_SEND_CHANNELS = [
  'theme:changed',
  'notifications:active-session',
] as const
```

- [ ] **Step 2: Add the listen channel**

In the same file, add `'notification:open-session'` to `ALLOWED_LISTEN_CHANNELS`, directly after the existing `'plugins:reveal-session',` entry (currently line 165):

```ts
  'plugins:reveal-session',
  'notification:open-session',
] as const
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web && npm run typecheck:node`
Expected: `typecheck:web` 0 errors; `typecheck:node` no new errors referencing `preload/index.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(#723): allow notification IPC channels in preload

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Renderer — report active session + handle click-through

**Files:**
- Modify: `src/renderer/hooks/useAppEffects.ts:7-15` (input type), `:73-77` (add effects)
- Modify: `src/renderer/App.tsx:118-121` (pass `setActiveSession`)

- [ ] **Step 1: Extend the effects input type**

In `src/renderer/hooks/useAppEffects.ts`, add `setActiveSession` to the `AppEffectsInput` interface (currently lines 7-15), after the `setActiveProject` line:

```ts
interface AppEffectsInput {
  activeSessionId: string | null
  dockLayout: UseDockLayoutResult
  settings: { defaultRuntime: string }
  setActiveProject: (id: string) => void
  setActiveSession: (id: string | null) => void
  spawnAgent: (options: SpawnAgentOptions) => Promise<unknown>
  refreshOpenFiles: () => Promise<void>
  refreshDiff: () => Promise<void>
}
```

- [ ] **Step 2: Add the two effects**

In the same file, directly after the existing `plugins:reveal-session` effect (currently ends line 77), add:

```ts
  // Tell the main process which session is active so 'non-active' scope desktop
  // notifications can suppress the session the user is currently viewing.
  useEffect(() => {
    window.electronAPI.send('notifications:active-session', input.activeSessionId)
  }, [input.activeSessionId])

  // A clicked desktop notification asks the app to focus a specific session.
  useEffect(() => window.electronAPI.on('notification:open-session', (...args: unknown[]) => {
    const payload = args[0] as { projectId?: string; sessionId?: string }
    if (typeof payload?.sessionId !== 'string' || payload.sessionId.length === 0) return
    if (typeof payload.projectId === 'string' && payload.projectId.length > 0) {
      input.setActiveProject(payload.projectId)
    }
    input.setActiveSession(payload.sessionId)
    input.dockLayout.openSiblingPanel(payload.sessionId)
  }), [input.setActiveProject, input.setActiveSession, input.dockLayout.openSiblingPanel])
```

- [ ] **Step 3: Pass `setActiveSession` from App.tsx**

In `src/renderer/App.tsx`, update the `useAppEffects` call (currently lines 118-121) to pass `setActiveSession` (already in scope from line 49):

```ts
  const appEffects = useAppEffects({
    activeSessionId, dockLayout, settings,
    setActiveProject, setActiveSession, spawnAgent, refreshOpenFiles: codeView.refreshOpenFiles, refreshDiff,
  })
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:web`
Expected: 0 errors.

- [ ] **Step 5: Run the existing renderer tests for App effects (sanity)**

Run: `npm test -- src/renderer`
Expected: PASS (no regressions in renderer tests).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/hooks/useAppEffects.ts src/renderer/App.tsx
git commit -m "feat(#723): report active session + handle notification click-through

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Settings UI — the Desktop Notifications card

**Files:**
- Create: `src/renderer/components/modals/settings/NotificationSettingsSection.tsx`
- Modify: `src/renderer/components/modals/settings/GeneralSettingsSection.tsx:1-7` (imports), `:9-38` (props), `:151` (render)
- Modify: `src/renderer/components/modals/settings/SettingsModalBody.tsx:3` (import type), `:44-46` (props)
- Modify: `src/renderer/components/modals/SettingsModal.tsx:2-4` (import), `:25-37` (state), `:56-65` (reset), `:79-98` (save), `:136-137` (pass props)

- [ ] **Step 1: Create the section component**

Create `src/renderer/components/modals/settings/NotificationSettingsSection.tsx`:

```tsx
import React from 'react'
import type { NotificationScope, NotificationSettings } from '../../../../shared/types'
import { modalStyles } from '../SettingsModal.styles'
import { SectionCard } from './SettingsSectionLayout'

interface Props {
  value: NotificationSettings
  onChange: (value: NotificationSettings) => void
}

const SCOPE_OPTIONS: Array<{ id: NotificationScope; label: string }> = [
  { id: 'non-active', label: 'Sessions I am not viewing' },
  { id: 'unfocused', label: 'Only when Manifold is in the background' },
  { id: 'always', label: 'Always' },
]

export function NotificationSettingsSection({ value, onChange }: Props): React.JSX.Element {
  const set = (patch: Partial<NotificationSettings>): void => onChange({ ...value, ...patch })
  const dim = value.enabled ? {} : { opacity: 0.5 }
  const disabled = !value.enabled

  return (
    <SectionCard
      title="Desktop Notifications"
      description="Native notifications when an agent finishes, needs input, or errors. macOS Focus / Do Not Disturb is respected automatically."
    >
      <div style={modalStyles.fieldGrid}>
        <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => set({ enabled: event.target.checked })}
            style={modalStyles.checkboxInput}
          />
          Enable desktop notifications
        </label>
        <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull, ...dim }}>
          <input
            type="checkbox"
            checked={value.onDone}
            disabled={disabled}
            onChange={(event) => set({ onDone: event.target.checked })}
            style={modalStyles.checkboxInput}
          />
          When an agent finishes
        </label>
        <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull, ...dim }}>
          <input
            type="checkbox"
            checked={value.onWaiting}
            disabled={disabled}
            onChange={(event) => set({ onWaiting: event.target.checked })}
            style={modalStyles.checkboxInput}
          />
          When an agent needs input
        </label>
        <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull, ...dim }}>
          <input
            type="checkbox"
            checked={value.onError}
            disabled={disabled}
            onChange={(event) => set({ onError: event.target.checked })}
            style={modalStyles.checkboxInput}
          />
          When an agent hits an error
        </label>
        <label style={{ ...modalStyles.label, ...modalStyles.fieldSpanFull, ...dim }}>
          Notify for
          <select
            value={value.scope}
            disabled={disabled}
            onChange={(event) => set({ scope: event.target.value as NotificationScope })}
            style={modalStyles.select}
          >
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
    </SectionCard>
  )
}
```

- [ ] **Step 2: Render the card inside the General tab**

In `src/renderer/components/modals/settings/GeneralSettingsSection.tsx`:

(a) Add the import after the existing `SectionCard, SectionHeader` import (line 7):

```ts
import { NotificationSettingsSection } from './NotificationSettingsSection'
```

(b) Add the type import to the existing type import on line 2:

```ts
import type { NotificationSettings, SearchAiSettings, ShellPromptSegments } from '../../../../shared/types'
```

(c) Add to the `Props` interface (after `searchAiSettings: SearchAiSettings` on line 37):

```ts
  notifications: NotificationSettings
  onNotificationsChange: (value: NotificationSettings) => void
```

(d) Render the card as a third card in the `cardGrid`, directly after the closing `</SectionCard>` of the "Appearance And Terminal" card (currently line 151), before the closing `</div>`:

```tsx
        <NotificationSettingsSection value={props.notifications} onChange={props.onNotificationsChange} />
```

- [ ] **Step 3: Thread the props through SettingsModalBody**

In `src/renderer/components/modals/settings/SettingsModalBody.tsx`:

(a) Add the type to the existing type import on line 3:

```ts
import type { NotificationSettings, SearchAiSettings, EditorSettings, ShellPromptSegments } from '../../../../shared/types'
```

(b) Add to the `Props` interface, after `onNotificationSoundChange: (enabled: boolean) => void` (line 46):

```ts
  notifications: NotificationSettings
  onNotificationsChange: (value: NotificationSettings) => void
```

(These are forwarded to `GeneralSettingsSection` automatically via the existing `<GeneralSettingsSection {...props} />` on line 98 — no JSX change needed.)

- [ ] **Step 4: Add state + save in SettingsModal**

In `src/renderer/components/modals/SettingsModal.tsx`:

(a) `DEFAULT_SETTINGS` is already imported (line 2). Add a state hook after `notificationSound` (line 25):

```ts
  const [notifications, setNotifications] = useState(settings.notifications ?? DEFAULT_SETTINGS.notifications)
```

(b) In the reset `useEffect`, after `setNotificationSound(settings.notificationSound)` (line 56):

```ts
    setNotifications(settings.notifications ?? DEFAULT_SETTINGS.notifications)
```

(c) In `handleSave`'s `onSave({ ... })` object, after `notificationSound,` (line 86):

```ts
      notifications,
```

(d) In `handleSave`'s dependency array (line 98), add `notifications` (e.g. after `notificationSound`):

```ts
  }, [defaultRuntime, theme, scrollbackLines, terminalFontFamily, defaultBaseBranch, storagePath, notificationSound, notifications, shellHistoryScope, shellPromptSegments, autoGenerateMessages, showCommitAndPrButtons, sidebarResizeReversed, searchAiSettings, editorSettings, provisioners, transcription, onSave, onClose])
```

(e) In the `<SettingsModalBody ... />` props (after `onNotificationSoundChange={setNotificationSound}` on line 137):

```tsx
          notifications={notifications}
          onNotificationsChange={setNotifications}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck:web`
Expected: 0 errors.

- [ ] **Step 6: Run the settings modal tests**

Run: `npm test -- src/renderer/components/modals`
Expected: PASS (existing `SettingsModal.provisioning.test.tsx` and any other modal tests still pass).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/modals/settings/NotificationSettingsSection.tsx src/renderer/components/modals/settings/GeneralSettingsSection.tsx src/renderer/components/modals/settings/SettingsModalBody.tsx src/renderer/components/modals/SettingsModal.tsx
git commit -m "feat(#723): Desktop Notifications settings card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Architecture doc + doc map

**Files:**
- Create: `docs/architecture/notifications.md`
- Modify: `docs/README.md` (doc map)

- [ ] **Step 1: Read the doc conventions**

Read `docs/llm-wiki.md` (frontmatter schema) and one existing page (e.g. `docs/architecture/store.md`) for the exact `covers:`/`updated:` frontmatter format, then read the doc-map section of `docs/README.md` to see where to add the entry.

- [ ] **Step 2: Write the page**

Create `docs/architecture/notifications.md` with frontmatter `covers: src/main/notifications` and `updated: 2026-06-14`, documenting: the policy rules (baseline / dedupe / scope / event-toggle / 2s debounce), the `SessionManager.sendToRenderer` hook, the active-session IPC (`notifications:active-session`) and click-through (`notification:open-session`), and the settings shape. Cite `file:line` for each claim against current code (verify each before writing).

- [ ] **Step 3: Add to the doc map**

Add a one-line entry for `notifications.md` to the doc map in `docs/README.md`, matching the format of the existing entries.

- [ ] **Step 4: Lint the wiki**

Run: `bash scripts/wiki-lint.sh`
Expected: no stale/missing-page errors for `notifications.md`.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/notifications.md docs/README.md
git commit -m "docs(#723): architecture page for the notifications subsystem

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Full verification + manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS — whole suite green (includes the new policy + store tests).

- [ ] **Step 2: Type gates**

Run: `npm run typecheck:web && npm run typecheck:node`
Expected: `typecheck:web` 0 errors. `typecheck:node` shows only the pre-existing baseline — no new errors attributable to any file changed in this plan.

- [ ] **Step 3: Manual smoke test in the running app**

> Requires a complete `node_modules` in the worktree. If `npm run dev` fails with an Electron/`better-sqlite3` error, symlink `node_modules` from the primary clone (`~/git/manifold`) first (see project memory). Grant notification permission to Electron/Manifold in macOS System Settings → Notifications if prompted.

Run: `npm run dev`

Verify each acceptance criterion:
1. With default settings, spawn an agent, switch focus to another app, and let the agent finish a turn (reach `waiting`) → a "Agent needs input" notification appears.
2. While **viewing** that session with the window focused → no notification on its transitions (default `non-active` scope). A *different* (background) session's transition still notifies.
3. Click a notification → Manifold comes to the front and that session is opened/active.
4. Open Settings → General → "Desktop Notifications": toggle the master off → event checkboxes + scope dim and no notifications fire. Toggle a single event off → only that event stops notifying. Change scope to "Always" → notifications fire even while focused/viewing.
5. Change a setting, quit, relaunch → the change persisted (check `~/.manifold/config.json` contains the `notifications` object).

- [ ] **Step 4: Pre-PR git hygiene**

Run: `git fsck --no-dangling`
Expected: no errors (worktree integrity check before opening the PR).

- [ ] **Step 5: Open the PR**

Use the `gh-create-pr` skill (or `gh pr create`) with a branch/title tied to the feature, body referencing issue #723 and listing the acceptance criteria with verification evidence.

---

## Self-Review

**Spec coverage:**
- "Transition to done/waiting/error raises a notification when enabled" → Tasks 2 (policy), 3 (notifier), 4 (hook). ✓
- "Clicking a notification focuses the app and opens the session" → Task 5 (`revealSession`), 6 (channels), 7 (renderer handler). ✓
- "Per-event and global toggles + scope, persist across restarts" → Tasks 1 (types/defaults/store), 8 (UI). ✓ Persistence verified Task 1 tests + Task 10 step 5.
- "Rely on macOS system DND" → no code; native `Notification` honors it. Documented in the card copy (Task 8) + page (Task 9). ✓
- "Baseline / dedupe / debounce noise control (esp. error flicker)" → Task 2 tests + policy. ✓
- "Typecheck + test gates pass" → Tasks throughout + Task 10. ✓
- Wiki sync (CLAUDE.md §5, new `src/main/*` subsystem) → Task 9. ✓

**Type consistency:** `NotificationSettings`/`NotificationScope` (Task 1) are the same names used in the policy (`NotificationObservation.settings`, Task 2), notifier (Task 3), and UI (Task 8). `NotifiableStatus` defined in Task 2 and imported by Task 3. `observe(...)` (Task 2) is the method called by `AgentNotifier.onStatus` (Task 3). `setNotificationService`/`onStatus` (Task 4) match the shape `AgentNotifier` exposes (Task 3). Channels `notifications:active-session` (send) and `notification:open-session` (listen) are spelled identically in main (Task 5), preload (Task 6), and renderer (Task 7).

**Placeholder scan:** none — every step shows the literal code/command and expected output.
