import { useCallback, useRef } from 'react'
import type { AgentSession, SpawnAgentOptions } from '../../../shared/types'

export function useSpawnAgent(
  currentProjectId: string | null,
  refreshCurrentProject: (preferredSessionId?: string | null) => Promise<AgentSession[] | null>,
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>,
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>
): (options: SpawnAgentOptions) => Promise<AgentSession | null> {
  return useCallback(
    async (options: SpawnAgentOptions): Promise<AgentSession | null> => {
      try {
        const session = (await window.electronAPI.invoke('agent:spawn', options)) as AgentSession
        if (options.projectId === currentProjectId) {
          setSessions((prev) => {
            const index = prev.findIndex((existing) => existing.id === session.id)
            if (index === -1) return [...prev, session]
            const next = [...prev]
            next[index] = session
            return next
          })
          setActiveSessionId(session.id)
          void refreshCurrentProject(session.id)
        }
        return session
      } catch {
        if (options.projectId === currentProjectId) {
          void refreshCurrentProject()
        }
        return null
      }
    },
    [currentProjectId, refreshCurrentProject, setSessions, setActiveSessionId]
  )
}

export function useKillAgent(): (sessionId: string) => Promise<void> {
  return useCallback(async (sessionId: string): Promise<void> => {
    try {
      await window.electronAPI.invoke('agent:kill', sessionId)
    } catch {
      // Agent may already be dead
    }
  }, [])
}

/** Deleting an agent closes that agent and nothing else. The folders it worked
 *  in belong to its workspace, which its siblings are still using — removing
 *  the workspace is what removes them. */
export function useDeleteAgent(
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>,
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>
): (sessionId: string) => Promise<void> {
  return useCallback(
    async (sessionId: string): Promise<void> => {
      await window.electronAPI.invoke('agent:kill', sessionId)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      setActiveSessionId((prev) => (prev === sessionId ? null : prev))
    },
    [setSessions, setActiveSessionId]
  )
}

export function useResumeAgent(
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>
): (sessionId: string, runtimeId: string) => Promise<void> {
  return useCallback(
    async (sessionId: string, runtimeId: string): Promise<void> => {
      try {
        const resumed = (await window.electronAPI.invoke(
          'agent:resume',
          sessionId,
          runtimeId
        )) as AgentSession
        setSessions((prev) => prev.map((s) => (s.id === resumed.id ? resumed : s)))
      } catch {
        // Resume failed
      }
    },
    [setSessions]
  )
}
