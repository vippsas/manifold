import { useState, useEffect } from 'react'

export function useShellSession(cwd: string | null): string | null {
  const [shellSessionId, setShellSessionId] = useState<string | null>(null)

  useEffect(() => {
    if (!cwd) return

    let cancelled = false

    void (async () => {
      const result = (await window.electronAPI.invoke('shell:create', cwd)) as { sessionId: string }
      if (!cancelled) {
        setShellSessionId(result.sessionId)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [cwd])

  return shellSessionId
}
