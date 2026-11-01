import { useEffect, useRef } from 'react'
import type { AgentSession } from '../../../shared/types'

export function useAutoResume(
  activeSessionId: string | null,
  sessions: AgentSession[],
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>
): void {
  const selectionRef = useRef({ id: activeSessionId, handled: false })
  const inFlightRef = useRef(new Set<string>())

  useEffect(() => {
    if (selectionRef.current.id !== activeSessionId) {
      selectionRef.current = { id: activeSessionId, handled: false }
    }
    if (!activeSessionId || selectionRef.current.handled) return
    const session = sessions.find((s) => s.id === activeSessionId)
    // A cross-repo selection arrives before its repo's sessions. Keep it
    // pending until that list loads, even though the selected id stays put.
    if (!session) return
    // Resolve each selection once, including running sessions: a later exit
    // or resync must not restart the agent the user is already viewing.
    selectionRef.current.handled = true
    if (session.pid !== null || session.status !== 'done' || !session.runtimeId) return
    // Chat-mode sessions intentionally have no persistent PTY between messages.
    if (session.nonInteractive || inFlightRef.current.has(activeSessionId)) return

    inFlightRef.current.add(activeSessionId)
    void (async () => {
      try {
        const resumed = (await window.electronAPI.invoke(
          'agent:resume',
          activeSessionId,
          session.runtimeId
        )) as AgentSession
        setSessions((prev) => prev.map((s) => (s.id === resumed.id ? resumed : s)))
      } catch {
        // Resume failed — session stays dormant
      } finally {
        inFlightRef.current.delete(activeSessionId)
      }
    })()
  }, [activeSessionId, sessions, setSessions])
}
