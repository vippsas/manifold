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

  // Fetch current status on mount so we don't assume 'running' when the
  // session is actually 'waiting' or 'done' (e.g. after navigating back).
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    window.electronAPI.invoke('simple:get-agent-status', sessionId).then((s) => {
      if (cancelled || !s) return
      const current = s as AgentStatus
      setStatus(current)
      if (current !== 'running') {
        setDurationMs(0)
      }
    })
    return () => { cancelled = true }
  }, [sessionId])

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
