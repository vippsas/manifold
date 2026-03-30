import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BackgroundAgentFeedbackType,
  BackgroundAgentGenerationStatus,
  BackgroundAgentSnapshot,
} from '../../../background-agent/schemas/background-agent-types'

export interface UseBackgroundAgentResult {
  snapshot: BackgroundAgentSnapshot | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  refresh: () => Promise<void>
  submitFeedback: (suggestionId: string, feedbackType: BackgroundAgentFeedbackType) => Promise<void>
}

export function useBackgroundAgent(
  activeProjectId: string | null,
  activeSessionId: string | null,
): UseBackgroundAgentResult {
  const [snapshot, setSnapshot] = useState<BackgroundAgentSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const pollTimerRef = useRef<number | null>(null)
  const refreshPromiseRef = useRef<Promise<void> | null>(null)

  const stopPolling = useCallback((): void => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
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
      setError(formatError(nextError))
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
      return
    }

    const requestId = ++requestIdRef.current
    setIsLoading(true)
    void window.electronAPI.invoke('background-agent:list-suggestions', activeProjectId)
      .then((response) => {
        if (requestId !== requestIdRef.current) return
        const nextSnapshot = response as BackgroundAgentSnapshot
        setSnapshot(nextSnapshot)
        setIsRefreshing(nextSnapshot.status.isRefreshing)
        setError(nextSnapshot.status.error)
        if (nextSnapshot.status.isRefreshing) {
          scheduleStatusPoll(activeProjectId, requestId, 0, 800)
        }
      })
      .catch((nextError) => {
        if (requestId !== requestIdRef.current) return
        setSnapshot(null)
        setError(formatError(nextError))
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setIsLoading(false)
        }
      })
    return () => {
      requestIdRef.current += 1
      refreshPromiseRef.current = null
      stopPolling()
    }
  }, [activeProjectId, scheduleStatusPoll, stopPolling])

  const refresh = useCallback(async (): Promise<void> => {
    if (!activeProjectId) return
    if (refreshPromiseRef.current) return refreshPromiseRef.current

    const refreshPromise = (async () => {
      const requestId = ++requestIdRef.current
      stopPolling()
      setSnapshot((current) => {
        if (!current) {
          return {
            profile: null,
            suggestions: [],
            status: {
              phase: 'profiling',
              isRefreshing: true,
              lastRefreshedAt: null,
              error: null,
              summary: 'Starting a new Ideas refresh.',
              detail: 'Preparing local project context and research topics.',
              stepLabel: 'Step 1 of 4',
              recentActivity: ['Started a new Ideas refresh.'],
            },
          }
        }

        return {
          ...current,
          status: {
            ...current.status,
            phase: 'profiling',
            isRefreshing: true,
            error: null,
            summary: 'Starting a new Ideas refresh.',
            detail: 'Preparing local project context and research topics.',
            stepLabel: 'Step 1 of 4',
            recentActivity: current.status.recentActivity.at(-1) === 'Started a new Ideas refresh.'
              ? current.status.recentActivity
              : [...current.status.recentActivity, 'Started a new Ideas refresh.'].slice(-6),
          },
        }
      })
      setIsRefreshing(true)
      setError(null)
      try {
        const refreshRequest = window.electronAPI.invoke(
          'background-agent:refresh',
          activeProjectId,
          activeSessionId,
        ) as Promise<BackgroundAgentSnapshot>
        scheduleStatusPoll(activeProjectId, requestId, 2, 150)
        const nextSnapshot = await refreshRequest
        if (requestId !== requestIdRef.current) return
        setSnapshot(nextSnapshot)
        setIsRefreshing(nextSnapshot.status.isRefreshing)
        setError(nextSnapshot.status.error)
      } catch (nextError) {
        if (requestId !== requestIdRef.current) return
        setError(formatError(nextError))
      } finally {
        stopPolling()
        if (requestId === requestIdRef.current) {
          setIsRefreshing(false)
        }
      }
    })()

    refreshPromiseRef.current = refreshPromise
    try {
      await refreshPromise
    } finally {
      if (refreshPromiseRef.current === refreshPromise) {
        refreshPromiseRef.current = null
      }
    }
  }, [activeProjectId, activeSessionId, scheduleStatusPoll, stopPolling])

  const submitFeedback = useCallback(async (
    suggestionId: string,
    feedbackType: BackgroundAgentFeedbackType,
  ): Promise<void> => {
    if (!activeProjectId) return
    await window.electronAPI.invoke(
      'background-agent:feedback',
      activeProjectId,
      suggestionId,
      feedbackType,
    )
  }, [activeProjectId])

  return {
    snapshot,
    isLoading,
    isRefreshing,
    error,
    refresh,
    submitFeedback,
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  return 'Unknown background-agent error.'
}
