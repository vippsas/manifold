import { useCallback, useRef } from 'react'
import type { AgentSession, SpawnAgentOptions } from '../../../shared/types'
import { withDefaultAgentName } from '../../components/sidebar/agent-labels'

export function useSpawnAgent(
  currentProjectId: string | null,
  /** The current project's agents, read at spawn time so the default name sees
   *  the latest list without making `spawnAgent` change identity with it. */
  currentSessionsRef: React.MutableRefObject<AgentSession[]>,
  refreshCurrentProject: (preferredSessionId?: string | null) => Promise<AgentSession[] | null>,
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>,
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>
): (options: SpawnAgentOptions) => Promise<AgentSession | null> {
  return useCallback(
    async (options: SpawnAgentOptions): Promise<AgentSession | null> => {
      // Every spawn is named here, so a path that passes no name (opening a
      // project, creating one, promoting a draft chat) still gets a tab that
      // tells its agent apart. Another project's agents are not in the list, so
      // the first agent there simply gets the plain runtime name.
      const siblings = options.projectId === currentProjectId ? currentSessionsRef.current : []
      try {
        const session = (await window.electronAPI.invoke('agent:spawn', withDefaultAgentName(options, siblings))) as AgentSession
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
    [currentProjectId, currentSessionsRef, refreshCurrentProject, setSessions, setActiveSessionId]
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
