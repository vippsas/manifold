import { useState, useCallback, useEffect } from 'react'
import type { AgentSession, AgentStatus, SpawnAgentOptions } from '../../shared/types'
import { useIpcListener } from './useIpc'

interface AgentStatusEvent {
  sessionId: string
  status: AgentStatus
}

interface AgentExitEvent {
  sessionId: string
  code: number | null
}

interface UseAgentSessionResult {
  sessions: AgentSession[]
  activeSessionId: string | null
  activeSession: AgentSession | null
  spawnAgent: (options: SpawnAgentOptions) => Promise<AgentSession | null>
  killAgent: (sessionId: string) => Promise<void>
  setActiveSession: (sessionId: string) => void
}

export function useAgentSession(projectId: string | null): UseAgentSessionResult {
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  useFetchSessionsOnProjectChange(projectId, activeSessionId, setSessions, setActiveSessionId)
  useStatusListener(setSessions)
  useExitListener(setSessions)

  const spawnAgent = useSpawnAgent(setSessions, setActiveSessionId)
  const killAgent = useKillAgent()

  const setActiveSession = useCallback((sessionId: string): void => {
    setActiveSessionId(sessionId)
  }, [])

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

  return { sessions, activeSessionId, activeSession, spawnAgent, killAgent, setActiveSession }
}

function useFetchSessionsOnProjectChange(
  projectId: string | null,
  activeSessionId: string | null,
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>,
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>
): void {
  useEffect(() => {
    if (!projectId) {
      setSessions([])
      setActiveSessionId(null)
      return
    }

    const fetchSessions = async (): Promise<void> => {
      try {
        const result = (await window.electronAPI.invoke('agent:sessions', projectId)) as AgentSession[]
        setSessions(result)
        if (result.length > 0 && !activeSessionId) {
          setActiveSessionId(result[0].id)
        }
      } catch {
        // IPC not ready yet during init, sessions will arrive via events
      }
    }

    void fetchSessions()
  }, [projectId, activeSessionId, setSessions, setActiveSessionId])
}

function useStatusListener(
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>
): void {
  useIpcListener<AgentStatusEvent>(
    'agent:status',
    useCallback(
      (event: AgentStatusEvent) => {
        setSessions((prev) =>
          prev.map((s) => (s.id === event.sessionId ? { ...s, status: event.status } : s))
        )
      },
      [setSessions]
    )
  )
}

function useExitListener(
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>
): void {
  useIpcListener<AgentExitEvent>(
    'agent:exit',
    useCallback(
      (event: AgentExitEvent) => {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === event.sessionId
              ? { ...s, status: event.code === 0 ? 'done' : 'error', pid: null }
              : s
          )
        )
      },
      [setSessions]
    )
  )
}

function useSpawnAgent(
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>,
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>
): (options: SpawnAgentOptions) => Promise<AgentSession | null> {
  return useCallback(
    async (options: SpawnAgentOptions): Promise<AgentSession | null> => {
      try {
        const session = (await window.electronAPI.invoke('agent:spawn', options)) as AgentSession
        setSessions((prev) => [...prev, session])
        setActiveSessionId(session.id)
        return session
      } catch {
        return null
      }
    },
    [setSessions, setActiveSessionId]
  )
}

function useKillAgent(): (sessionId: string) => Promise<void> {
  return useCallback(async (sessionId: string): Promise<void> => {
    try {
      await window.electronAPI.invoke('agent:kill', sessionId)
    } catch {
      // Agent may already be dead
    }
  }, [])
}
