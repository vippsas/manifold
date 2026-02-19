import { useState, useEffect, useRef } from 'react'

export function useShellSession(cwd: string | null): string | null {
  const [shellSessionId, setShellSessionId] = useState<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!cwd) return

    let cancelled = false

    void (async () => {
      const result = (await window.electronAPI.invoke('shell:create', cwd)) as { sessionId: string }
      if (!cancelled) {
        sessionIdRef.current = result.sessionId
        setShellSessionId(result.sessionId)
      } else {
        // Component unmounted or cwd changed before we got the session — kill it
        void window.electronAPI.invoke('agent:kill', result.sessionId).catch(() => {})
      }
    })()

    return () => {
      cancelled = true
      if (sessionIdRef.current) {
        void window.electronAPI.invoke('agent:kill', sessionIdRef.current).catch(() => {})
        sessionIdRef.current = null
      }
    }
  }, [cwd])

  return shellSessionId
}
