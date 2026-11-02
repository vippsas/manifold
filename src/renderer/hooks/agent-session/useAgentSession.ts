import { useState, useCallback, useEffect, useRef } from 'react'
import type { AgentSession, AgentStatus, SpawnAgentOptions } from '../../../shared/types'
import { useIpcListener } from '../app/useIpc'
import { useSpawnAgent, useKillAgent, useDeleteAgent, useResumeAgent } from './useAgentSession-actions'
import { useAutoResume } from './useAutoResume'

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
  projectId: string,
  result: AgentSession[],
  preferredSessionId: string | null | undefined,
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>,
  setLoadedProjectId: React.Dispatch<React.SetStateAction<string | null>>,
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>,
  clearedRef: React.MutableRefObject<boolean>,
): void {
  setSessions(result)
  setLoadedProjectId(projectId)
  setActiveSessionId((prev) => {
    // The list is per repo, the view is per workspace. A selection cleared on
    // purpose — entering a workspace with no agent of its own — must survive a
    // resync: the repo's first or remembered session lives in another workspace,
    // and promoting it here showed (and auto-resumed) that agent in the wrong
    // place. The flag lifts as soon as anything selects a session again.
    if (clearedRef.current) return null
    // A workspace entry can select its remembered sibling in the same batch
    // as changing projects. Keep that explicit selection ahead of repo memory.
    if (prev && result.some((session) => session.id === prev)) return prev
    if (preferredSessionId && result.some((session) => session.id === preferredSessionId)) return preferredSessionId
    return result.length > 0 ? result[0].id : null
  })
}

interface UseAgentSessionResult {
  sessions: AgentSession[]
  loadedProjectId: string | null
  /** Discovery completed, including a failed load; cleared while a request is pending. */
  settledProjectId: string | null
  activeSessionId: string | null
  activeSession: AgentSession | null
  spawnAgent: (options: SpawnAgentOptions) => Promise<AgentSession | null>
  killAgent: (sessionId: string) => Promise<void>
  deleteAgent: (sessionId: string) => Promise<void>
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
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  // True from an explicit `setActiveSession(null)` until a session is selected
  // by any route (sidebar, dock, spawn). See `applyProjectSessions`. Set
  // synchronously with the state, not in an effect: a spawn's resync can land
  // before any effect runs and must already see the flag lifted.
  const clearedRef = useRef(false)
  const selectSessionId = useCallback((next: React.SetStateAction<string | null>): void => {
    if (typeof next === 'string') clearedRef.current = false
    setActiveSessionId(next)
  }, [])

  const { refreshSessions, settledProjectId, rememberedActiveSessionRef } = useFetchSessionsOnProjectChange(
    projectId, activeSessionId, sessions, setSessions, setLoadedProjectId, setActiveSessionId, clearedRef,
  )
  useStatusListener(setSessions)
  useExitListener(setSessions)
  useAutoResume(activeSessionId, sessions, setSessions)
  const outputtingSessionIds = useActivityStateListener()

  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  const spawnAgent = useSpawnAgent(projectId, sessionsRef, refreshSessions, setSessions, selectSessionId)
  const killAgent = useKillAgent()
  const deleteAgent = useDeleteAgent(setSessions, setActiveSessionId)
  const resumeAgent = useResumeAgent(setSessions)

  const setActiveSession = useCallback((sessionId: string | null): void => {
    clearedRef.current = sessionId === null
    selectSessionId(sessionId)
  }, [selectSessionId])

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

  return { sessions, loadedProjectId, settledProjectId, activeSessionId, activeSession, spawnAgent, killAgent, deleteAgent, setActiveSession, resumeAgent, outputtingSessionIds, rememberedActiveSessionRef }
}

interface FetchSessionsResult {
  refreshSessions: (preferredSessionId?: string | null) => Promise<AgentSession[] | null>
  settledProjectId: string | null
  rememberedActiveSessionRef: React.MutableRefObject<string | null>
}

function useFetchSessionsOnProjectChange(
  projectId: string | null,
  activeSessionId: string | null,
  sessions: AgentSession[],
  setSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>,
  setLoadedProjectId: React.Dispatch<React.SetStateAction<string | null>>,
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>,
  clearedRef: React.MutableRefObject<boolean>,
): FetchSessionsResult {
  const requestIdRef = useRef(0)
  const [settledProjectId, setSettledProjectId] = useState<string | null>(null)
  // Remembers the last active session per project so re-entering a repo
  // restores the agent that was selected, instead of resetting to the first.
  const lastSessionByProjectRef = useRef<Map<string, string>>(new Map())
  // The session restored from per-project memory on the latest project switch,
  // exposed so the dock can protect it from layout-restore overwrites (#773).
  const rememberedActiveSessionRef = useRef<string | null>(null)
  useEffect(() => {
    // Capture a settled selection with its own project. Cleanup runs after
    // render has already advanced to the incoming workspace's selection.
    if (projectId && activeSessionId
      && sessions.some((s) => s.id === activeSessionId && s.projectId === projectId)) {
      lastSessionByProjectRef.current.set(projectId, activeSessionId)
    }
  }, [projectId, activeSessionId, sessions])

  const syncSessions = useCallback(
    async (preferredSessionId?: string | null): Promise<AgentSession[] | null> => {
      if (!projectId) return null
      const requestId = ++requestIdRef.current
      setSettledProjectId(null)
      try {
        const result = await fetchProjectSessions(projectId)
        if (requestId !== requestIdRef.current) return null
        applyProjectSessions(projectId, result, preferredSessionId, setSessions, setLoadedProjectId, setActiveSessionId, clearedRef)
        return result
      } catch {
        // IPC not ready yet during init, sessions will arrive via events
        return null
      } finally {
        if (requestId === requestIdRef.current) setSettledProjectId(projectId)
      }
    },
    [projectId, setSessions, setLoadedProjectId, setActiveSessionId, clearedRef]
  )

  useEffect(() => {
    if (!projectId) {
      requestIdRef.current += 1
      rememberedActiveSessionRef.current = null
      setSessions([])
      setLoadedProjectId(null)
      setSettledProjectId(null)
      setActiveSessionId(null)
      return
    }

    const remembered = lastSessionByProjectRef.current.get(projectId) ?? null
    rememberedActiveSessionRef.current = remembered
    void syncSessions(remembered)
  }, [projectId, setSessions, setLoadedProjectId, setActiveSessionId, syncSessions])

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

  return { refreshSessions: syncSessions, settledProjectId, rememberedActiveSessionRef }
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

