import { useCallback, useEffect, useRef, useState } from 'react'
import type { WatchSetupStatus, WatchRunResult, WatchFrameRef } from '../../shared/watch-types'

interface ProgressEvent {
  sessionId: string
  kind: 'log' | 'stage'
  line?: string
  stage?: string
}

interface InstallProgressEvent {
  line: string
}

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
  const [progressLog, setProgressLog] = useState<string[]>([])
  const [currentStage, setCurrentStage] = useState<string | null>(null)
  const [frames, setFrames] = useState<WatchFrameRef[]>([])
  const sessionRef = useRef<string | null>(activeSessionId)
  sessionRef.current = activeSessionId

  const refreshSetupStatus = useCallback(async (): Promise<void> => {
    const status = (await window.electronAPI.invoke('watch:setup-status')) as WatchSetupStatus
    setSetupStatus(status)
  }, [])

  const runWatch = useCallback(async (source: string, question?: string): Promise<WatchRunResult> => {
    if (!activeSessionId) throw new Error('No active session')
    const trimmed = source.trim()
    if (!trimmed) throw new Error('Source is required')
    setProgressLog([])
    setCurrentStage('download')
    setFrames([])
    const result = (await window.electronAPI.invoke(
      'watch:run',
      activeSessionId,
      trimmed,
      question,
    )) as WatchRunResult
    setCurrentStage(null)
    if (!result.ok) throw new Error(result.error ?? 'watch:run failed')
    if (result.frames) setFrames(result.frames)
    return result
  }, [activeSessionId])

  const installBinaries = useCallback(async () => {
    setProgressLog([])
    const result = (await window.electronAPI.invoke('watch:install-binaries')) as {
      installed: string[]
      alreadyPresent: string[]
      errors: Array<{ binary: string; message: string }>
    }
    await refreshSetupStatus()
    return result
  }, [refreshSetupStatus])

  const readFrame = useCallback(async (path: string): Promise<string> => {
    return (await window.electronAPI.invoke('watch:read-frame', path)) as string
  }, [])

  const clearProgress = useCallback(() => setProgressLog([]), [])

  useEffect(() => {
    const offProgress = window.electronAPI.on('watch:progress', (event) => {
      const ev = event as ProgressEvent
      if (sessionRef.current && ev.sessionId !== sessionRef.current) return
      if (ev.kind === 'log' && ev.line) {
        setProgressLog((prev) => [...prev, ev.line!].slice(-200))
      } else if (ev.kind === 'stage' && ev.stage) {
        setCurrentStage(ev.stage)
      }
    })
    const offInstall = window.electronAPI.on('watch:install-progress', (event) => {
      const ev = event as InstallProgressEvent
      if (ev.line) setProgressLog((prev) => [...prev, ev.line].slice(-200))
    })
    return () => {
      offProgress?.()
      offInstall?.()
    }
  }, [])

  return {
    setupStatus, refreshSetupStatus, runWatch, installBinaries,
    progressLog, clearProgress, currentStage,
    frames, readFrame,
  }
}
