import { useState, useEffect, useRef } from 'react'

interface CachedShellSession {
  sessionId: string
  refreshToken: string
}

function useShellLifecycle(key: string | null, cwd: string | null, refreshToken: string): string | null {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const cacheRef = useRef(new Map<string, CachedShellSession>())

  useEffect(() => {
    if (!key || !cwd) {
      setSessionId(null)
      return
    }

    // Reuse cached session if we've already created a shell for this key
    const cached = cacheRef.current.get(key)
    if (cached) {
      if (cached.refreshToken === refreshToken) {
        setSessionId(cached.sessionId)
        return
      }
      cacheRef.current.delete(key)
      void window.electronAPI.invoke('agent:kill', cached.sessionId).catch(() => {})
    }

    let cancelled = false

    void (async () => {
      const result = (await window.electronAPI.invoke('shell:create', cwd)) as { sessionId: string }
      if (!cancelled) {
        cacheRef.current.set(key, { sessionId: result.sessionId, refreshToken })
        setSessionId(result.sessionId)
      } else {
        void window.electronAPI.invoke('agent:kill', result.sessionId).catch(() => {})
      }
    })()

    return () => {
      cancelled = true
      // Don't kill the session — it stays cached for reuse when switching back
    }
  }, [key, cwd, refreshToken])

  // Clean up all cached sessions on unmount
  useEffect(() => {
    const cache = cacheRef.current
    return () => {
      for (const entry of cache.values()) {
        void window.electronAPI.invoke('agent:kill', entry.sessionId).catch(() => {})
      }
      cache.clear()
    }
  }, [])

  return sessionId
}

export function useShellSessions(
  worktreeCwd: string | null,
  projectCwd: string | null,
  agentSessionId: string | null,
  shellPrompt: boolean
): { worktreeSessionId: string | null; projectSessionId: string | null } {
  const promptRefreshToken = shellPrompt ? 'manifold-prompt' : 'native-prompt'
  // Worktree path is already unique per agent
  const worktreeSessionId = useShellLifecycle(worktreeCwd, worktreeCwd, promptRefreshToken)
  // No-worktree sessions still need a project-root shell fallback.
  const projectKey = !worktreeCwd && agentSessionId ? `project:${agentSessionId}` : null
  const projectSessionId = useShellLifecycle(projectKey, projectKey ? projectCwd : null, promptRefreshToken)

  return { worktreeSessionId, projectSessionId }
}
