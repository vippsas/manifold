import { useState, useEffect, useRef } from 'react'

function useShellLifecycle(cwd: string | null): string | null {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!cwd) {
      setSessionId(null)
      return
    }

    let cancelled = false

    void (async () => {
      const result = (await window.electronAPI.invoke('shell:create', cwd)) as { sessionId: string }
      if (!cancelled) {
        sessionIdRef.current = result.sessionId
        setSessionId(result.sessionId)
      } else {
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

  return sessionId
}

export function useShellSessions(
  worktreeCwd: string | null,
  projectCwd: string | null
): { worktreeSessionId: string | null; projectSessionId: string | null } {
  const worktreeSessionId = useShellLifecycle(worktreeCwd)
  const projectSessionId = useShellLifecycle(projectCwd)

  return { worktreeSessionId, projectSessionId }
}
