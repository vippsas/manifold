import { useEffect, useRef } from 'react'

const DEBOUNCE_MS = 10000

export function useStatusNotification(
  outputtingSessionIds: Set<string>,
  enabled: boolean
): void {
  const prevOutputting = useRef<Set<string>>(new Set())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    if (!enabled) {
      for (const timer of timers.current.values()) clearTimeout(timer)
      timers.current.clear()
      prevOutputting.current = new Set(outputtingSessionIds)
      return
    }

    // Detect sessions that stopped outputting (dot stopped blinking)
    for (const sessionId of prevOutputting.current) {
      if (!outputtingSessionIds.has(sessionId) && !timers.current.has(sessionId)) {
        const timer = setTimeout(() => {
          timers.current.delete(sessionId)
          void window.electronAPI.invoke('app:beep')
        }, DEBOUNCE_MS)
        timers.current.set(sessionId, timer)
      }
    }

    // Cancel timer if session resumes outputting (dot starts blinking again)
    for (const sessionId of outputtingSessionIds) {
      const existing = timers.current.get(sessionId)
      if (existing) {
        clearTimeout(existing)
        timers.current.delete(sessionId)
      }
    }

    prevOutputting.current = new Set(outputtingSessionIds)
  })

  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer)
    }
  }, [])
}
