import { useState, useEffect } from 'react'
import type { AgentStatus } from '../../shared/types'

export function useAgentStatus(sessionId: string | null): AgentStatus {
  const [status, setStatus] = useState<AgentStatus>('running')

  useEffect(() => {
    if (!sessionId) return
    setStatus('running')
    const unsub = window.electronAPI.on(
      'agent:status',
      (event: unknown) => {
        const e = event as { sessionId: string; status: AgentStatus }
        if (e.sessionId === sessionId) {
          setStatus(e.status)
        }
      },
    )
    return unsub
  }, [sessionId])

  return status
}
