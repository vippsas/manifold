import type { SessionManager } from '../session/session-manager'

export interface RunWatchResult {
  ok: boolean
  error?: string
}

export function runWatch(
  sessionManager: SessionManager,
  sessionId: string,
  url: string,
  question?: string,
): RunWatchResult {
  const trimmedUrl = url.trim()
  if (!trimmedUrl) return { ok: false, error: 'URL is required' }
  const session = sessionManager.getSession(sessionId)
  if (!session) return { ok: false, error: 'Session not found' }
  if (session.status !== 'running' && session.status !== 'waiting') {
    return { ok: false, error: 'Session is not running' }
  }
  const q = question?.trim()
  const command = q ? `/watch ${trimmedUrl} ${q}\n` : `/watch ${trimmedUrl}\n`
  try {
    sessionManager.sendInput(sessionId, command)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'PTY write failed' }
  }
}
