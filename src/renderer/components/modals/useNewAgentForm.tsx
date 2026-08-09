import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentRuntime, AgentSession } from '../../../shared/types'
import { nextAgentName } from '../sidebar/agent-labels'

export type AgentMode = 'interactive' | 'chat'

/** What starting an agent needs: a runtime, a mode, and an optional label. No
 *  branch, no worktree, no repo — the workspace already is the place to work,
 *  and every agent started here joins it. */
export interface NewAgentLaunchOptions {
  runtimeId: string
  /** The agent's name. Always set: an unnamed session falls back to its branch
   *  label, which every agent in the workspace shares. */
  displayName: string
  nonInteractive?: boolean
}

export interface NewAgentProps {
  /** The workspace the agent joins — the only thing that decides where it runs. */
  workspaceName: string
  /** The workspace's primary folder, for labelling resumable agents. */
  primaryPath: string
  defaultRuntime: string
  defaultAgentMode?: AgentMode
  onLaunch: (options: NewAgentLaunchOptions) => Promise<unknown>
  /** The workspace's agents; the finished ones can be resumed instead. */
  existingSessions?: AgentSession[]
  onResumeSession?: (sessionId: string, runtimeId: string) => Promise<void>
  onDeleteSession?: (session: AgentSession) => void
  focusTrigger?: number
}

/** The single agent being launched right now, so a layout can mark the row that
 *  is starting. Null when idle. */
export interface PendingLaunch {
  runtimeId: string
  mode: AgentMode
}

/**
 * Every piece of new-agent state and the launch itself, shared by the two
 * layouts that offer it: the compact dialog and the full-panel start view. Both
 * now present the same provider list, so `launch` takes the runtime and mode
 * explicitly from the clicked row rather than reading a single selection back
 * from state.
 */
export function useNewAgentForm({
  defaultRuntime,
  defaultAgentMode = 'interactive',
  onLaunch,
  existingSessions = [],
}: NewAgentProps) {
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([])
  const [pending, setPending] = useState<PendingLaunch | null>(null)
  const [error, setError] = useState('')
  const mountedRef = useRef(true)

  useEffect(() => {
    // Set true on mount (not just via useRef's initial value): under React
    // StrictMode the effect runs setup → cleanup → setup, and without this the
    // cleanup's `false` would stick after remount, aborting later async work.
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    void window.electronAPI.invoke('runtimes:list').then((list) => {
      setRuntimes(list as AgentRuntime[])
    })
  }, [])

  const reusableSessions = existingSessions.filter((session) => (
    (session.status === 'done' || session.status === 'error')
    && !session.groupId
  ))

  const launch = useCallback(
    async (runtimeId: string, mode: AgentMode): Promise<void> => {
      if (pending) return
      const runtime = runtimes.find((r) => r.id === runtimeId)
      if (runtime?.installed === false) return
      setError('')

      // The workspace names the agent after its runtime, taking the first free
      // slot among the names already in use ("Claude", then "Claude 2"…).
      //
      // Every agent is named explicitly, including the first. A blank name used
      // to be left undefined downstream (`session-creator.ts:190`), and a
      // session with no name falls back to its branch label (`DockTab.tsx:93`)
      // — which every agent in a workspace shares. So the first Claude agent and
      // the first Codex agent, both unnamed, showed the *same* tab label.
      const displayName = nextAgentName(runtimeId, existingSessions)

      const options: NewAgentLaunchOptions = {
        runtimeId,
        displayName,
        nonInteractive: mode === 'chat',
      }

      // Persist the chosen mode and runtime so the next New Agent view defaults
      // to them. Only write what changed to avoid flooding renderers with
      // settings:changed broadcasts.
      const remembered: Partial<{ defaultAgentMode: AgentMode; defaultRuntime: string }> = {}
      if (mode !== defaultAgentMode) remembered.defaultAgentMode = mode
      if (runtimeId !== defaultRuntime) remembered.defaultRuntime = runtimeId
      if (Object.keys(remembered).length > 0) {
        window.electronAPI.invoke('settings:update', remembered).catch((err) => {
          console.error('[NewAgentForm] failed to persist agent defaults:', err)
        })
      }

      setPending({ runtimeId, mode })
      try {
        const session = await onLaunch(options)
        if (!session && mountedRef.current) setError('Failed to start agent.')
      } catch (err) {
        if (mountedRef.current) {
          const message = err instanceof Error ? err.message : String(err)
          setError(`Failed to start agent: ${message}`)
        }
      } finally {
        if (mountedRef.current) setPending(null)
      }
    },
    [runtimes, existingSessions, pending, defaultAgentMode, defaultRuntime, onLaunch]
  )

  return {
    runtimes,
    pending,
    loading: pending !== null,
    error,
    reusableSessions,
    launch,
  }
}
