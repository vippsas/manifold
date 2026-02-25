import { useState, useCallback, useRef, useEffect } from 'react'
import type { FetchResult } from '../../shared/types'

interface UseFetchProjectResult {
  fetchingProjectId: string | null
  lastFetchedProjectId: string | null
  fetchResult: FetchResult | null
  fetchError: string | null
  fetchProject: (projectId: string) => Promise<void>
}

export function useFetchProject(
  onSuccess?: (projectId: string) => void
): UseFetchProjectResult {
  const [fetchingProjectId, setFetchingProjectId] = useState<string | null>(null)
  const [lastFetchedProjectId, setLastFetchedProjectId] = useState<string | null>(null)
  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const resultTimer = useRef<ReturnType<typeof setTimeout>>()
  const errorTimer = useRef<ReturnType<typeof setTimeout>>()
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess

  useEffect(() => {
    return () => {
      clearTimeout(resultTimer.current)
      clearTimeout(errorTimer.current)
    }
  }, [])

  const fetchProject = useCallback(async (projectId: string): Promise<void> => {
    setFetchingProjectId(projectId)
    setLastFetchedProjectId(null)
    setFetchError(null)
    setFetchResult(null)
    clearTimeout(resultTimer.current)
    clearTimeout(errorTimer.current)
    try {
      const result = await window.electronAPI.invoke('git:fetch', projectId) as FetchResult
      setFetchResult(result)
      setLastFetchedProjectId(projectId)
      resultTimer.current = setTimeout(() => {
        setFetchResult(null)
        setLastFetchedProjectId(null)
      }, 5000)
      onSuccessRef.current?.(projectId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fetch failed'
      setFetchError(message)
      setLastFetchedProjectId(projectId)
      errorTimer.current = setTimeout(() => {
        setFetchError(null)
        setLastFetchedProjectId(null)
      }, 5000)
    } finally {
      setFetchingProjectId(null)
    }
  }, [])

  return { fetchingProjectId, lastFetchedProjectId, fetchResult, fetchError, fetchProject }
}
