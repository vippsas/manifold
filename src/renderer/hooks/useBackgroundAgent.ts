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

  useEffect(() => {
    if (!activeProjectId) {
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
        setSnapshot(response as BackgroundAgentSnapshot)
        setError(null)
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
  }, [activeProjectId])

  const refresh = useCallback(async (): Promise<void> => {
    if (!activeProjectId) return
    setIsRefreshing(true)
    try {
      const nextSnapshot = await window.electronAPI.invoke(
        'background-agent:refresh',
        activeProjectId,
        activeSessionId,
      ) as BackgroundAgentSnapshot
      setSnapshot(nextSnapshot)
      setError(nextSnapshot.status.error)
    } catch (nextError) {
      setError(formatError(nextError))
    } finally {
      setIsRefreshing(false)
    }
  }, [activeProjectId, activeSessionId])

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
