import { useCallback, useEffect, useState } from 'react'
import type { VerdictRecord } from '../../shared/verdict-types'

export interface UseVerdictsResult {
  records: VerdictRecord[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useVerdicts(projectId: string | null): UseVerdictsResult {
  const [records, setRecords] = useState<VerdictRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRecords = useCallback(async (): Promise<void> => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const result = (await window.electronAPI.invoke('verdicts:list', { projectId })) as VerdictRecord[]
      setRecords(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId) {
      setRecords([])
      setError(null)
      return
    }
    void fetchRecords()
  }, [projectId, fetchRecords])

  return { records, loading, error, refresh: fetchRecords }
}
