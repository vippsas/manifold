import { useCallback, useEffect, useState } from 'react'

export interface UseUpdateLogResult {
  visible: boolean
  log: string
  loading: boolean
  error: string | null
  close: () => void
  refresh: () => Promise<void>
  clear: () => Promise<void>
  checkForUpdates: () => Promise<void>
}

async function loadUpdateLog(): Promise<string> {
  const nextLog = await window.electronAPI.invoke('updater:log')
  return typeof nextLog === 'string' ? nextLog : 'Update log is unavailable.'
}

function resolveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useUpdateLog(): UseUpdateLogResult {
  const [visible, setVisible] = useState(false)
  const [log, setLog] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setLog(await loadUpdateLog())
    } catch (err) {
      setError(resolveErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const close = useCallback((): void => {
    setVisible(false)
  }, [])

  const checkForUpdates = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      await window.electronAPI.invoke('updater:check')
      setLog(await loadUpdateLog())
    } catch (err) {
      setError(resolveErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      await window.electronAPI.invoke('updater:clear-log')
      setLog(await loadUpdateLog())
    } catch (err) {
      setError(resolveErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const unsub = window.electronAPI.on('show-update-log', () => {
      setVisible(true)
      void refresh()
    })
    return unsub
  }, [refresh])

  return {
    visible,
    log,
    loading,
    error,
    close,
    refresh,
    clear,
    checkForUpdates,
  }
}
