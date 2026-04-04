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

interface AgentSessionsChangedEvent {
  projectId: string
}

interface AgentActivityStateEvent {
  sessionId: string
  isOutputting: boolean
}

async function fetchProjectSessions(projectId: string): Promise<AgentSession[]> {
  return (await window.electronAPI.invoke('agent:sessions', projectId)) as AgentSession[]
}

function applyProjectSessions(
  result: AgentSession[],
  preferredSessionId: string | null | undefined,
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>,
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>
): void {
  setSessions(result)
  setActiveSessionId((prev) => {
    const preferred = preferredSessionId ?? prev
    if (preferred && result.some((session) => session.id === preferred)) return preferred
    return result.length > 0 ? result[0].id : null
  })
}

interface UseAgentSessionResult {
  sessions: AgentSession[]
  activeSessionId: string | null
  activeSession: AgentSession | null
  spawnAgent: (options: SpawnAgentOptions) => Promise<AgentSession | null>
  killAgent: (sessionId: string) => Promise<void>
  deleteAgent: (sessionId: string) => Promise<void>
  setActiveSession: (sessionId: string | null) => void
  resumeAgent: (sessionId: string, runtimeId: string) => Promise<void>
  outputtingSessionIds: Set<string>
}

export function useAgentSession(projectId: string | null): UseAgentSessionResult {
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const refreshSessions = useFetchSessionsOnProjectChange(projectId, activeSessionId, setSessions, setActiveSessionId)
  useStatusListener(setSessions)
  useExitListener(setSessions)
  useAutoResume(activeSessionId, sessions, setSessions)
  const outputtingSessionIds = useActivityStateListener()

  const spawnAgent = useSpawnAgent(projectId, refreshSessions, setSessions, setActiveSessionId)
  const killAgent = useKillAgent()
  const deleteAgent = useDeleteAgent(setSessions, setActiveSessionId)
  const resumeAgent = useResumeAgent(setSessions)

  const setActiveSession = useCallback((sessionId: string | null): void => {
    setActiveSessionId(sessionId)
  }, [])

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

  return { sessions, activeSessionId, activeSession, spawnAgent, killAgent, deleteAgent, setActiveSession, resumeAgent, outputtingSessionIds }
}

function useFetchSessionsOnProjectChange(
  projectId: string | null,
  _activeSessionId: string | null,
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>,
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>
): (preferredSessionId?: string | null) => Promise<AgentSession[] | null> {
  const requestIdRef = useRef(0)

  const syncSessions = useCallback(
    async (preferredSessionId?: string | null): Promise<AgentSession[] | null> => {
      if (!projectId) return null
      const requestId = ++requestIdRef.current
      try {
        const result = await fetchProjectSessions(projectId)
        if (requestId !== requestIdRef.current) return null
        applyProjectSessions(result, preferredSessionId, setSessions, setActiveSessionId)
        return result
      } catch {
        // IPC not ready yet during init, sessions will arrive via events
        return null
      }
    },
    [projectId, setSessions, setActiveSessionId]
  )

  useEffect(() => {
    if (!projectId) {
      requestIdRef.current += 1
      setSessions([])
      setActiveSessionId(null)
      return
    }

    void syncSessions()
  }, [projectId, setSessions, setActiveSessionId, syncSessions])

  useIpcListener<AgentSessionsChangedEvent>(
    'agent:sessions-changed',
    useCallback(
      (event: AgentSessionsChangedEvent) => {
        if (!projectId || event.projectId !== projectId) return
        void syncSessions()
      },
      [projectId, syncSessions]
    )
  )

  return syncSessions
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

function useActivityStateListener(): Set<string> {
  const [outputtingIds, setOutputtingIds] = useState<Set<string>>(new Set())

  useIpcListener<AgentActivityStateEvent>(
    'agent:activity-state',
    useCallback(
      (event: AgentActivityStateEvent) => {
        setOutputtingIds((prev) => {
          const next = new Set(prev)
          if (event.isOutputting) {
            next.add(event.sessionId)
          } else {
            next.delete(event.sessionId)
          }
          // Avoid re-render if nothing changed
          if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev
          return next
        })
      },
      []
    )
  )

  return outputtingIds
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
