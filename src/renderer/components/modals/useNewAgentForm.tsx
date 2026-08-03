import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentRuntime, AgentSession } from '../../../shared/types'

export type AgentMode = 'interactive' | 'chat'

/** What starting an agent needs: a runtime, a mode, and an optional label. No
 *  branch, no worktree, no repo — the workspace already is the place to work,
 *  and every agent started here joins it. */
export interface NewAgentLaunchOptions {
  runtimeId: string
  /** The agent's name; blank leaves it named after its runtime. */
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

/**
 * Every piece of new-agent state and the launch itself, shared by the two
 * layouts that offer it: the classic form (modal, compact workspace panel) and
 * the hero card grid. `submit` takes an optional mode so a layout can launch
 * straight from a "Start Chat" click without waiting for a `setMode` render.
 */
export function useNewAgentForm({
  defaultRuntime,
  defaultAgentMode = 'interactive',
  onLaunch,
  existingSessions = [],
  focusTrigger,
}: NewAgentProps) {
  const [mode, setMode] = useState<AgentMode>(defaultAgentMode)
  const [taskDescription, setTaskDescription] = useState('')
  const [runtimeId, setRuntimeId] = useState(defaultRuntime)
  const [loading, setLoading] = useState(false)
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([])
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
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
    inputRef.current?.focus()
  }, [focusTrigger])

  useEffect(() => {
    void window.electronAPI.invoke('runtimes:list').then((list) => {
      setRuntimes(list as AgentRuntime[])
    })
  }, [])

  const selectedRuntime = runtimes.find((r) => r.id === runtimeId)
  const runtimeInstalled = selectedRuntime?.installed !== false
  const reusableSessions = existingSessions.filter((session) => (
    (session.status === 'done' || session.status === 'error')
    && !session.groupId
  ))

  const canSubmit = runtimeInstalled

  const submit = useCallback(
    async (modeOverride?: AgentMode): Promise<void> => {
      if (!canSubmit) return
      setError('')
      // A layout that launches straight from a "Start Chat" click passes the mode
      // in: reading it back from state here would see the pre-click value.
      const effectiveMode = modeOverride ?? mode
      if (modeOverride && modeOverride !== mode) setMode(modeOverride)

      // The name names the agent and nothing else. It used to seed a branch name
      // — a random city when left blank — but the workspace owns the branch now,
      // so a blank name simply leaves the agent named after its runtime.
      const options: NewAgentLaunchOptions = {
        runtimeId,
        displayName: taskDescription.trim(),
        nonInteractive: effectiveMode === 'chat',
      }

      // Persist the chosen mode and runtime so the next New Agent form defaults
      // to them. Done at submit (not on every click) to avoid flooding all
      // renderers with settings:changed broadcasts while the user tries options out.
      const remembered: Partial<{ defaultAgentMode: AgentMode; defaultRuntime: string }> = {}
      if (effectiveMode !== defaultAgentMode) remembered.defaultAgentMode = effectiveMode
      if (runtimeId !== defaultRuntime) remembered.defaultRuntime = runtimeId
      if (Object.keys(remembered).length > 0) {
        window.electronAPI.invoke('settings:update', remembered).catch((err) => {
          console.error('[NewAgentForm] failed to persist agent defaults:', err)
        })
      }

      setLoading(true)
      try {
        const session = await onLaunch(options)
        if (!session && mountedRef.current) setError('Failed to start agent.')
      } catch (err) {
        if (mountedRef.current) {
          const message = err instanceof Error ? err.message : String(err)
          setError(`Failed to start agent: ${message}`)
        }
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    },
    [runtimeId, taskDescription, canSubmit, mode, defaultAgentMode, defaultRuntime, onLaunch]
  )

  return {
    mode,
    setMode,
    taskDescription,
    setTaskDescription,
    runtimeId,
    setRuntimeId,
    runtimes,
    selectedRuntime,
    runtimeInstalled,
    loading,
    error,
    canSubmit,
    reusableSessions,
    inputRef,
    submit,
  }
}
