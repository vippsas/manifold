import { useState, useCallback, useEffect, useRef } from 'react'
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
  deleteAgent: (sessionId: string) => void
  setActiveSession: (sessionId: string | null) => void
  resumeAgent: (sessionId: string, runtimeId: string) => Promise<void>
}

export function useAgentSession(projectId: string | null): UseAgentSessionResult {
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  useFetchSessionsOnProjectChange(projectId, activeSessionId, setSessions, setActiveSessionId)
  useStatusListener(setSessions)
  useExitListener(setSessions)
  useAutoResume(activeSessionId, sessions, setSessions)

  const spawnAgent = useSpawnAgent(setSessions, setActiveSessionId)
  const killAgent = useKillAgent()
  const deleteAgent = useDeleteAgent(setSessions, setActiveSessionId)
  const resumeAgent = useResumeAgent(setSessions)

  const setActiveSession = useCallback((sessionId: string | null): void => {
    setActiveSessionId(sessionId)
  }, [])

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

  return { sessions, activeSessionId, activeSession, spawnAgent, killAgent, deleteAgent, setActiveSession, resumeAgent }
}

function useFetchSessionsOnProjectChange(
  projectId: string | null,
  _activeSessionId: string | null,
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
        setActiveSessionId((prev) => {
          // Keep current selection if it belongs to this project's sessions
          if (prev && result.some((s) => s.id === prev)) return prev
          // Otherwise select the first session or clear
          return result.length > 0 ? result[0].id : null
        })
      } catch {
        // IPC not ready yet during init, sessions will arrive via events
      }
    }

    void fetchSessions()
  }, [projectId, setSessions, setActiveSessionId])
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

function useAutoResume(
  activeSessionId: string | null,
  sessions: AgentSession[],
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>
): void {
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  useEffect(() => {
    if (!activeSessionId) return
    const session = sessionsRef.current.find((s) => s.id === activeSessionId)
    if (!session || session.pid !== null || session.status !== 'done') return
    if (!session.runtimeId) return

    void (async () => {
      try {
        const resumed = (await window.electronAPI.invoke(
          'agent:resume',
          activeSessionId,
          session.runtimeId
        )) as AgentSession
        setSessions((prev) => prev.map((s) => (s.id === resumed.id ? resumed : s)))
      } catch {
        // Resume failed — session stays dormant
      }
    })()
  }, [activeSessionId, setSessions])
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

function useDeleteAgent(
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>,
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>
): (sessionId: string) => void {
  return useCallback(
    (sessionId: string): void => {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      setActiveSessionId((prev) => (prev === sessionId ? null : prev))
      void window.electronAPI.invoke('agent:kill', sessionId).catch(() => {})
    },
    [setSessions, setActiveSessionId]
  )
}

function useResumeAgent(
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
