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
    // Set.has doesn't narrow the union, so assert after the NOTIFIABLE guard.
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
