import { useState, useCallback, useEffect, useRef } from 'react'
import type { AgentSession, AgentStatus, SpawnAgentOptions } from '../../shared/types'
import { useIpcListener } from './useIpc'
import { useSpawnAgent, useKillAgent, useDeleteAgent, useResumeAgent } from './useAgentSession-actions'

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
  deleteAgent: (sessionId: string, mode?: 'session' | 'worktree') => Promise<void>
  setActiveSession: (sessionId: string | null) => void
  resumeAgent: (sessionId: string, runtimeId: string) => Promise<void>
  outputtingSessionIds: Set<string>
  /** The session restored from this project's per-project memory on the latest
   *  project switch (null on a cold entry with no remembered session). Lets the
   *  dock protect a remembered agent from being overwritten by layout restore
   *  on repo re-entry, without affecting cold-start restore (#773). */
  rememberedActiveSessionRef: React.MutableRefObject<string | null>
}

export function useAgentSession(projectId: string | null): UseAgentSessionResult {
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const { refreshSessions, rememberedActiveSessionRef } = useFetchSessionsOnProjectChange(
    projectId, activeSessionId, setSessions, setActiveSessionId,
  )
  useStatusListener(setSessions)
  useExitListener(setSessions)
  useAutoResume(activeSessionId, sessions, setSessions)
  const outputtingSessionIds = useActivityStateListener()

  const spawnAgent = useSpawnAgent(projectId, refreshSessions, setSessions, setActiveSessionId)
  const killAgent = useKillAgent()
  const deleteAgent = useDeleteAgent(sessions, setSessions, setActiveSessionId)
  const resumeAgent = useResumeAgent(setSessions)

  const setActiveSession = useCallback((sessionId: string | null): void => {
    setActiveSessionId(sessionId)
  }, [])

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

  return { sessions, activeSessionId, activeSession, spawnAgent, killAgent, deleteAgent, setActiveSession, resumeAgent, outputtingSessionIds, rememberedActiveSessionRef }
}

interface FetchSessionsResult {
  refreshSessions: (preferredSessionId?: string | null) => Promise<AgentSession[] | null>
  rememberedActiveSessionRef: React.MutableRefObject<string | null>
}

function useFetchSessionsOnProjectChange(
  projectId: string | null,
  activeSessionId: string | null,
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>,
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>
): FetchSessionsResult {
  const requestIdRef = useRef(0)
  // Remembers the last active session per project so re-entering a repo
  // restores the agent that was selected, instead of resetting to the first.
  const lastSessionByProjectRef = useRef<Map<string, string>>(new Map())
  // The session restored from per-project memory on the latest project switch,
  // exposed so the dock can protect it from layout-restore overwrites (#773).
  const rememberedActiveSessionRef = useRef<string | null>(null)
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId

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
      rememberedActiveSessionRef.current = null
      setSessions([])
      setActiveSessionId(null)
      return
    }

    const remembered = lastSessionByProjectRef.current.get(projectId) ?? null
    rememberedActiveSessionRef.current = remembered
    void syncSessions(remembered)

    return () => {
      // On leaving this project, record whichever agent is active so we can
      // restore it on return. Runs before the next project's effect reads it.
      const active = activeSessionIdRef.current
      if (active) lastSessionByProjectRef.current.set(projectId, active)
    }
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

  return { refreshSessions: syncSessions, rememberedActiveSessionRef }
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
          if (event.isOutputting) {
            if (prev.has(event.sessionId)) return prev
            const next = new Set(prev)
            next.add(event.sessionId)
            return next
          } else {
            if (!prev.has(event.sessionId)) return prev
            const next = new Set(prev)
            next.delete(event.sessionId)
            return next
          }
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
    // Chat-mode sessions spawn a fresh print-mode process per message; they
    // intentionally have no persistent PTY between messages. Auto-resuming
    // would launch an interactive runtime and stream its TUI output into chat.
    if (session.nonInteractive) return

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

