import { useState, useCallback, useRef, useEffect } from 'react'
import type { FetchResult } from '../../../shared/types'

/** How long a fetch's outcome stays on the row before it fades. */
const MESSAGE_LINGER_MS = 5000

export interface UseFetchProjectResult {
  isFetching: boolean
  result: FetchResult | null
  error: string | null
  fetchProject: () => Promise<void>
}

/**
 * Fetches one repo's clone from origin and updates its base branch, for the
 * folder row that owns it. `git:fetch` works on the *clone*, not on a
 * workspace's checkout of it: it refreshes the branch new work is cut from,
 * which is the branch "behind origin" is measured against.
 *
 * The outcome — "Updated main: 3 new commits", or why it failed — lingers on
 * the row for a few seconds and then clears itself.
 */
export function useFetchProject(
  projectId: string,
  onFetched?: (projectId: string) => void,
): UseFetchProjectResult {
  const [isFetching, setIsFetching] = useState(false)
  const [result, setResult] = useState<FetchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const onFetchedRef = useRef(onFetched)
  onFetchedRef.current = onFetched

  useEffect(() => () => clearTimeout(timer.current), [])

  const fetchProject = useCallback(async (): Promise<void> => {
    setIsFetching(true)
    setResult(null)
    setError(null)
    clearTimeout(timer.current)
    try {
      const fetched = await window.electronAPI.invoke('git:fetch', projectId) as FetchResult
      setResult(fetched)
      onFetchedRef.current?.(projectId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed')
    } finally {
      setIsFetching(false)
      timer.current = setTimeout(() => {
        setResult(null)
        setError(null)
      }, MESSAGE_LINGER_MS)
    }
  }, [projectId])

  return { isFetching, result, error, fetchProject }
}
