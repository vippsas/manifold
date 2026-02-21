import { useState, useEffect, useRef } from 'react'

function useShellLifecycle(key: string | null, cwd: string | null): string | null {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const cacheRef = useRef(new Map<string, string>())

  useEffect(() => {
    if (!key || !cwd) {
      setSessionId(null)
      return
    }

    // Reuse cached session if we've already created a shell for this key
    const cached = cacheRef.current.get(key)
    if (cached) {
      setSessionId(cached)
      return
    }

    let cancelled = false

    void (async () => {
      const result = (await window.electronAPI.invoke('shell:create', cwd)) as { sessionId: string }
      if (!cancelled) {
        cacheRef.current.set(key, result.sessionId)
        setSessionId(result.sessionId)
      } else {
        void window.electronAPI.invoke('agent:kill', result.sessionId).catch(() => {})
      }
    })()

    return () => {
      cancelled = true
      // Don't kill the session — it stays cached for reuse when switching back
    }
  }, [key, cwd])

  // Clean up all cached sessions on unmount
  useEffect(() => {
    const cache = cacheRef.current
    return () => {
      for (const id of cache.values()) {
        void window.electronAPI.invoke('agent:kill', id).catch(() => {})
      }
      cache.clear()
    }
  }, [])

  return sessionId
}

export function useShellSessions(
  worktreeCwd: string | null,
  projectCwd: string | null,
  agentSessionId: string | null
): { worktreeSessionId: string | null; projectSessionId: string | null } {
  // Worktree path is already unique per agent
  const worktreeSessionId = useShellLifecycle(worktreeCwd, worktreeCwd)
  // Project path is shared across agents — use agent session ID to give each its own shell
  const projectKey = agentSessionId ? `project:${agentSessionId}` : null
  const projectSessionId = useShellLifecycle(projectKey, projectCwd)

  return { worktreeSessionId, projectSessionId }
}
