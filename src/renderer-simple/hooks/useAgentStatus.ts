import { useState, useEffect, useRef } from 'react'
import type { AgentStatus } from '../../shared/types'

export interface AgentStatusInfo {
  status: AgentStatus
  /** Duration in ms of the last completed run (running → done/waiting). null while running or before first run. */
  durationMs: number | null
}

export function useAgentStatus(sessionId: string | null): AgentStatusInfo {
  const [status, setStatus] = useState<AgentStatus>('running')
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const startedAtRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!sessionId) return
    setStatus('running')
    setDurationMs(null)
    startedAtRef.current = Date.now()

    const unsub = window.electronAPI.on(
      'agent:status',
      (event: unknown) => {
        const e = event as { sessionId: string; status: AgentStatus }
        if (e.sessionId === sessionId) {
          if (e.status === 'running') {
            startedAtRef.current = Date.now()
            setDurationMs(null)
          } else {
            setDurationMs(Date.now() - startedAtRef.current)
          }
          setStatus(e.status)
        }
      },
    )
    return unsub
  }, [sessionId])

  return { status, durationMs }
}
