import { Notification } from 'electron'
import type { AgentStatus, ManifoldSettings, NotificationSettings } from '../../shared/types'
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

  private currentSettings(): NotificationSettings {
    return this.deps.getSettings().notifications ?? DEFAULT_SETTINGS.notifications
  }

  /** Hook for SessionManager — called for every agent:status transition. */
  onStatus(sessionId: string, status: string): void {
    this.policy.observe({
      sessionId,
      // status arrives as a raw string from SessionManager's IPC payload; the
      // policy ignores any non-notify-worthy value via its NOTIFIABLE guard.
      newStatus: status as AgentStatus,
      settings: this.currentSettings(),
      windowFocused: this.deps.isWindowFocused(),
      activeSessionId: this.activeSessionId,
    })
  }

  private show(sessionId: string, status: NotifiableStatus): void {
    if (!Notification.isSupported()) return
    // Re-check the master toggle at fire time: the policy evaluated settings when
    // the (debounced) transition was observed; the user may have disabled
    // notifications during the debounce window.
    const settings = this.currentSettings()
    if (!settings.enabled) return
    const info = this.deps.resolveSession(sessionId)
    if (!info) return
    const name = info.displayName || info.taskDescription || info.branchName
    const notification = new Notification({ title: TITLES[status], body: name })
    notification.on('click', () => this.deps.revealSession(info.projectId, sessionId))
    notification.show()
  }
}
