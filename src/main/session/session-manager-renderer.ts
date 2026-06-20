import type { BrowserWindow } from 'electron'
import type { VerdictRecorder } from './verdict-recorder'

interface SessionManagerRendererDeps {
  mainWindow: BrowserWindow | null
  statusListener: ((sessionId: string, status: string) => void) | null
  verdictRecorder: VerdictRecorder | null
  notificationService: { onStatus: (sessionId: string, status: string) => void } | null
}

export function sendSessionManagerRendererEvent(
  deps: SessionManagerRendererDeps,
  channel: string,
  args: unknown[],
): void {
  if (channel === 'agent:status') {
    const payload = args[0] as { sessionId?: string; status?: string } | undefined
    if (payload?.sessionId && payload.status) {
      deps.statusListener?.(payload.sessionId, payload.status)
      deps.verdictRecorder?.onStatus(payload.sessionId, payload.status)
      deps.notificationService?.onStatus(payload.sessionId, payload.status)
    }
  }
  if (channel === 'agent:exit') {
    const payload = args[0] as { sessionId?: string } | undefined
    // Natural PTY exits finalize verdicts here; kill paths are idempotent.
    if (payload?.sessionId) {
      void deps.verdictRecorder?.onSessionTerminated(payload.sessionId)
    }
  }
  if (deps.mainWindow && !deps.mainWindow.isDestroyed()) {
    deps.mainWindow.webContents.send(channel, ...args)
  }
}
