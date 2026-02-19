import { useState, useEffect, useCallback } from 'react'
import type { FileChange } from '../../shared/types'

interface DiffResult {
  diff: string
  changedFiles: FileChange[]
}

interface UseDiffResult {
  diff: string
  changedFiles: FileChange[]
  loading: boolean
  error: string | null
  refreshDiff: () => Promise<void>
}

export function useDiff(sessionId: string | null): UseDiffResult {
  const [diff, setDiff] = useState('')
  const [changedFiles, setChangedFiles] = useState<FileChange[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshDiff = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      setDiff('')
      setChangedFiles([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = (await window.electronAPI.invoke('diff:get', sessionId)) as DiffResult
      setDiff(result.diff)
      setChangedFiles(result.changedFiles)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void refreshDiff()
  }, [refreshDiff])

  return {
    diff,
    changedFiles,
    loading,
    error,
    refreshDiff,
  }
}
