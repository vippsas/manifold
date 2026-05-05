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
  // Use \r (carriage return) — PTYs interpret \r as Enter. \n only inserts a
  // newline character into the input field, which is why /watch never submitted.
  const command = q ? `/watch ${trimmedUrl} ${q}\r` : `/watch ${trimmedUrl}\r`
  try {
    sessionManager.sendInput(sessionId, command)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'PTY write failed' }
  }
}
