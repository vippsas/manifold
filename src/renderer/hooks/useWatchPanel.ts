import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { WatchSetupStatus, WatchRunResult, WatchFrameRef } from '../../shared/watch-types'
import { watchPanelStore } from './watchPanelStore'

interface UseWatchPanel {
  setupStatus: WatchSetupStatus | null
  refreshSetupStatus: () => Promise<void>
  runWatch: (source: string, question?: string) => Promise<WatchRunResult>
  installBinaries: () => Promise<{ installed: string[]; alreadyPresent: string[]; errors: Array<{ binary: string; message: string }> }>
  progressLog: string[]
  clearProgress: () => void
  currentStage: string | null
  frames: WatchFrameRef[]
  readFrame: (path: string) => Promise<string>
}

export function useWatchPanel(activeSessionId: string | null): UseWatchPanel {
  const [setupStatus, setSetupStatus] = useState<WatchSetupStatus | null>(null)

  useEffect(() => {
    watchPanelStore.init()
  }, [])

  const subscribe = useCallback(
    (listener: () => void) => watchPanelStore.subscribe(activeSessionId, listener),
    [activeSessionId],
  )
  const getSnapshot = useCallback(() => watchPanelStore.get(activeSessionId), [activeSessionId])
  const sessionState = useSyncExternalStore(subscribe, getSnapshot)

  const refreshSetupStatus = useCallback(async (): Promise<void> => {
    const status = (await window.electronAPI.invoke('watch:setup-status')) as WatchSetupStatus
    setSetupStatus(status)
  }, [])

  const runWatch = useCallback(async (source: string, question?: string): Promise<WatchRunResult> => {
    if (!activeSessionId) throw new Error('No active session')
    const trimmed = source.trim()
    if (!trimmed) throw new Error('Source is required')
    const sid = activeSessionId
    watchPanelStore.resetForRun(sid)
    const result = (await window.electronAPI.invoke(
      'watch:run',
      sid,
      trimmed,
      question,
    )) as WatchRunResult
    watchPanelStore.setStage(sid, null)
    if (!result.ok) throw new Error(result.error ?? 'watch:run failed')
    if (result.frames) watchPanelStore.setFrames(sid, result.frames)
    return result
  }, [activeSessionId])

  const installBinaries = useCallback(async () => {
    if (activeSessionId) {
      watchPanelStore.clearProgressLog(activeSessionId)
      watchPanelStore.setInstallLogTarget(activeSessionId)
    }
    try {
      const result = (await window.electronAPI.invoke('watch:install-binaries')) as {
        installed: string[]
        alreadyPresent: string[]
        errors: Array<{ binary: string; message: string }>
      }
      await refreshSetupStatus()
      return result
    } finally {
      watchPanelStore.setInstallLogTarget(null)
    }
  }, [activeSessionId, refreshSetupStatus])

  const readFrame = useCallback(async (path: string): Promise<string> => {
    return (await window.electronAPI.invoke('watch:read-frame', path)) as string
  }, [])

  const clearProgress = useCallback(() => {
    if (activeSessionId) watchPanelStore.clearProgressLog(activeSessionId)
  }, [activeSessionId])

  return {
    setupStatus,
    refreshSetupStatus,
    runWatch,
    installBinaries,
    progressLog: sessionState.progressLog,
    clearProgress,
    currentStage: sessionState.currentStage,
    frames: sessionState.frames,
    readFrame,
  }
}
