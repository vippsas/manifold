import { useCallback, useState } from 'react'
import type { WatchSetupStatus } from '../../shared/watch-types'

interface UseWatchPanel {
  setupStatus: WatchSetupStatus | null
  refreshSetupStatus: () => Promise<void>
  runWatch: (url: string, question?: string) => Promise<void>
}

export function useWatchPanel(activeSessionId: string | null): UseWatchPanel {
  const [setupStatus, setSetupStatus] = useState<WatchSetupStatus | null>(null)

  const refreshSetupStatus = useCallback(async (): Promise<void> => {
    const status = (await window.electronAPI.invoke('watch:setup-status')) as WatchSetupStatus
    setSetupStatus(status)
  }, [])

  const runWatch = useCallback(async (url: string, question?: string): Promise<void> => {
    if (!activeSessionId) throw new Error('No active session')
    const trimmedUrl = url.trim()
    if (!trimmedUrl) throw new Error('URL is required')
    const result = (await window.electronAPI.invoke('watch:run', activeSessionId, trimmedUrl, question)) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error ?? 'watch:run failed')
  }, [activeSessionId])

  return { setupStatus, refreshSetupStatus, runWatch }
}
