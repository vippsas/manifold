import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BackgroundAgentFeedbackType,
  BackgroundAgentGenerationStatus,
  BackgroundAgentSnapshot,
} from '../../../background-agent/schemas/background-agent-types'
import {
  createRefreshBootstrapSnapshot,
  createResumeBootstrapSnapshot,
  formatBackgroundAgentError,
} from './background-agent-hook-helpers'

export interface UseBackgroundAgentResult {
  snapshot: BackgroundAgentSnapshot | null
  suggestions: BackgroundAgentSnapshot['suggestions']
  status: BackgroundAgentGenerationStatus | null
  isLoading: boolean
  isRefreshing: boolean
  isClearing: boolean
  error: string | null
  refresh: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  stop: () => Promise<void>
  clear: () => Promise<void>
  submitFeedback: (suggestionId: string, feedbackType: BackgroundAgentFeedbackType) => Promise<void>
}

export function useBackgroundAgent(
  activeProjectId: string | null,
  activeSessionId: string | null,
): UseBackgroundAgentResult {
  const [snapshot, setSnapshot] = useState<BackgroundAgentSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const pollTimerRef = useRef<number | null>(null)
  const runPromiseRef = useRef<Promise<void> | null>(null)

  const stopPolling = useCallback((): void => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const applySnapshot = useCallback((nextSnapshot: BackgroundAgentSnapshot): void => {
    setSnapshot(nextSnapshot)
    setIsRefreshing(nextSnapshot.status.isRefreshing)
    setError(nextSnapshot.status.error)
  }, [])

  const applyStatus = useCallback((status: BackgroundAgentGenerationStatus): void => {
    setSnapshot((current) => {
      if (!current) {
        return {
          profile: null,
          suggestions: [],
          status,
        }
      }
      return {
        ...current,
        status,
      }
    })
    setIsRefreshing(status.isRefreshing)
    setError(status.error)
  }, [])

  const scheduleStatusPoll = useCallback((
    projectId: string,
    requestId: number,
    warmupAttemptsRemaining: number,
    delayMs: number,
  ): void => {
    stopPolling()
    pollTimerRef.current = window.setTimeout(() => {
      void pollStatus(projectId, requestId, warmupAttemptsRemaining)
    }, delayMs)
  }, [stopPolling])

  const pollStatus = useCallback(async (
    projectId: string,
    requestId: number,
    warmupAttemptsRemaining: number,
  ): Promise<void> => {
    try {
      const nextStatus = await window.electronAPI.invoke(
        'background-agent:get-status',
        projectId,
      ) as BackgroundAgentGenerationStatus
      if (requestId !== requestIdRef.current) return

      const shouldKeepWarmup = !nextStatus.isRefreshing && warmupAttemptsRemaining > 0
      if (!shouldKeepWarmup) {
        applyStatus(nextStatus)
      }

      if (nextStatus.isRefreshing || shouldKeepWarmup) {
        scheduleStatusPoll(
          projectId,
          requestId,
          nextStatus.isRefreshing ? 0 : warmupAttemptsRemaining - 1,
          nextStatus.isRefreshing ? 800 : 250,
        )
      }
    } catch (nextError) {
      if (requestId !== requestIdRef.current) return
      setError(formatBackgroundAgentError(nextError))
    }
  }, [applyStatus, scheduleStatusPoll])

  useEffect(() => {
    stopPolling()
    setIsRefreshing(false)
    if (!activeProjectId) {
      requestIdRef.current += 1
      setSnapshot(null)
      setError(null)
      setIsLoading(false)
      setIsRefreshing(false)
      setIsClearing(false)
      return
    }

    const requestId = ++requestIdRef.current
    setIsLoading(true)
    void window.electronAPI.invoke('background-agent:list-suggestions', activeProjectId)
      .then((response) => {
        if (requestId !== requestIdRef.current) return
        const nextSnapshot = response as BackgroundAgentSnapshot
        applySnapshot(nextSnapshot)
        if (nextSnapshot.status.isRefreshing) {
          scheduleStatusPoll(activeProjectId, requestId, 0, 800)
        }
      })
      .catch((nextError) => {
        if (requestId !== requestIdRef.current) return
        setSnapshot(null)
        setError(formatBackgroundAgentError(nextError))
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setIsLoading(false)
        }
      })
    return () => {
      requestIdRef.current += 1
      runPromiseRef.current = null
      stopPolling()
    }
  }, [activeProjectId, applySnapshot, scheduleStatusPoll, stopPolling])

  const runLongTask = useCallback(async (
    channel: 'background-agent:refresh' | 'background-agent:resume',
    bootstrapSnapshot: BackgroundAgentSnapshot,
  ): Promise<void> => {
    if (!activeProjectId) return
    if (runPromiseRef.current) return runPromiseRef.current

    const runPromise = (async () => {
      const requestId = ++requestIdRef.current
      stopPolling()
      applySnapshot(bootstrapSnapshot)
      try {
        const request = window.electronAPI.invoke(
          channel,
          activeProjectId,
          activeSessionId,
        ) as Promise<BackgroundAgentSnapshot>
        scheduleStatusPoll(activeProjectId, requestId, 2, 150)
        const nextSnapshot = await request
        if (requestId !== requestIdRef.current) return
        applySnapshot(nextSnapshot)
      } catch (nextError) {
        if (requestId !== requestIdRef.current) return
        setError(formatBackgroundAgentError(nextError))
      } finally {
        stopPolling()
        if (requestId === requestIdRef.current) {
          setIsRefreshing(false)
        }
      }
    })()

    runPromiseRef.current = runPromise
    try {
      await runPromise
    } finally {
      if (runPromiseRef.current === runPromise) {
        runPromiseRef.current = null
      }
    }
  }, [activeProjectId, activeSessionId, applySnapshot, scheduleStatusPoll, stopPolling])

  const refresh = useCallback(async (): Promise<void> => {
    await runLongTask('background-agent:refresh', createRefreshBootstrapSnapshot(snapshot))
  }, [runLongTask, snapshot])

  const resume = useCallback(async (): Promise<void> => {
    if (!snapshot) return
    await runLongTask('background-agent:resume', createResumeBootstrapSnapshot(snapshot))
  }, [runLongTask, snapshot])

  const pause = useCallback(async (): Promise<void> => {
    if (!activeProjectId) return
    const nextSnapshot = await window.electronAPI.invoke(
      'background-agent:pause',
      activeProjectId,
    ) as BackgroundAgentSnapshot
    applySnapshot(nextSnapshot)
    if (nextSnapshot.status.isRefreshing) {
      scheduleStatusPoll(activeProjectId, requestIdRef.current, 0, 200)
    }
  }, [activeProjectId, applySnapshot, scheduleStatusPoll])

  const stop = useCallback(async (): Promise<void> => {
    if (!activeProjectId) return
    const nextSnapshot = await window.electronAPI.invoke(
      'background-agent:stop',
      activeProjectId,
    ) as BackgroundAgentSnapshot
    applySnapshot(nextSnapshot)
    if (nextSnapshot.status.isRefreshing) {
      scheduleStatusPoll(activeProjectId, requestIdRef.current, 0, 200)
    } else {
      stopPolling()
    }
  }, [activeProjectId, applySnapshot, scheduleStatusPoll, stopPolling])

  const submitFeedback = useCallback(async (
    suggestionId: string,
    feedbackType: BackgroundAgentFeedbackType,
  ): Promise<void> => {
    if (!activeProjectId) return
    const nextSnapshot = await window.electronAPI.invoke(
      'background-agent:feedback',
      activeProjectId,
      suggestionId,
      feedbackType,
    ) as BackgroundAgentSnapshot
    applySnapshot(nextSnapshot)
  }, [activeProjectId, applySnapshot])

  const clear = useCallback(async (): Promise<void> => {
    if (!activeProjectId) return
    stopPolling()
    setIsClearing(true)
    setError(null)
    try {
      const nextSnapshot = await window.electronAPI.invoke(
        'background-agent:clear',
        activeProjectId,
      ) as BackgroundAgentSnapshot
      applySnapshot(nextSnapshot)
    } catch (nextError) {
      setError(formatBackgroundAgentError(nextError))
    } finally {
      setIsClearing(false)
    }
  }, [activeProjectId, applySnapshot, stopPolling])

  return {
    snapshot,
    suggestions: snapshot?.suggestions ?? [],
    status: snapshot?.status ?? null,
    isLoading,
    isRefreshing,
    isClearing,
    error,
    refresh,
    pause,
    resume,
    stop,
    clear,
    submitFeedback,
  }
}
