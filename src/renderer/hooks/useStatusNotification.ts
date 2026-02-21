import { useEffect, useRef } from 'react'
import type { AgentSession, AgentStatus } from '../../shared/types'

const DEBOUNCE_MS = 2500

export function useStatusNotification(
  sessions: AgentSession[],
  enabled: boolean
): void {
  const prevStatuses = useRef<Map<string, AgentStatus>>(new Map())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    if (!enabled) {
      for (const timer of timers.current.values()) clearTimeout(timer)
      timers.current.clear()
      const next = new Map<string, AgentStatus>()
      for (const session of sessions) next.set(session.id, session.status)
      prevStatuses.current = next
      return
    }

    for (const session of sessions) {
      const prev = prevStatuses.current.get(session.id)
      const current = session.status

      if (prev === 'running' && current !== 'running') {
        if (!timers.current.has(session.id)) {
          const timer = setTimeout(() => {
            timers.current.delete(session.id)
            void window.electronAPI.invoke('app:beep')
          }, DEBOUNCE_MS)
          timers.current.set(session.id, timer)
        }
      }

      if (current === 'running') {
        const existing = timers.current.get(session.id)
        if (existing) {
          clearTimeout(existing)
          timers.current.delete(session.id)
        }
      }
    }

    const next = new Map<string, AgentStatus>()
    for (const session of sessions) next.set(session.id, session.status)
    prevStatuses.current = next
  })

  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer)
    }
  }, [])
}
