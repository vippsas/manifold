import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BackgroundAgentFeedbackType,
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

  const stopPolling = useCallback((): void => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const pollSnapshot = useCallback(async (projectId: string, requestId: number): Promise<void> => {
    try {
      const nextSnapshot = await window.electronAPI.invoke(
        'background-agent:list-suggestions',
        projectId,
      ) as BackgroundAgentSnapshot
      if (requestId !== requestIdRef.current) return
      setSnapshot(nextSnapshot)
      setIsRefreshing(nextSnapshot.status.isRefreshing)
      setError(nextSnapshot.status.error)
      if (nextSnapshot.status.isRefreshing) {
        pollTimerRef.current = window.setTimeout(() => {
          void pollSnapshot(projectId, requestId)
        }, 800)
      }
    } catch (nextError) {
      if (requestId !== requestIdRef.current) return
      setError(formatError(nextError))
    }
  }, [])

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
      stopPolling()
    }
  }, [activeProjectId, stopPolling])

  const refresh = useCallback(async (): Promise<void> => {
    if (!activeProjectId) return
    const requestId = ++requestIdRef.current
    stopPolling()
    setIsRefreshing(true)
    setError(null)
    void pollSnapshot(activeProjectId, requestId)
    try {
      const nextSnapshot = await window.electronAPI.invoke(
        'background-agent:refresh',
        activeProjectId,
        activeSessionId,
      ) as BackgroundAgentSnapshot
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
  }, [activeProjectId, activeSessionId, pollSnapshot, stopPolling])

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
