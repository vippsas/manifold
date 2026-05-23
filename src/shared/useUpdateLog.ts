import { useCallback, useEffect, useState } from 'react'
import type { ReleaseNotes } from './types'

export type UpdateCenterTab = 'releaseNotes' | 'diagnostics'

export interface UseUpdateLogResult {
  visible: boolean
  activeTab: UpdateCenterTab
  currentVersion: string
  releaseNotes: ReleaseNotes | null
  log: string
  loading: boolean
  error: string | null
  close: () => void
  refresh: () => Promise<void>
  clear: () => Promise<void>
  checkForUpdates: () => Promise<void>
  openReleaseNotes: (version?: string) => void
  openDiagnostics: () => void
  openReleaseNotesExternal: () => Promise<void>
  setActiveTab: (tab: UpdateCenterTab) => void
}

async function loadUpdateLog(): Promise<string> {
  const nextLog = await window.electronAPI.invoke('updater:log')
  return typeof nextLog === 'string' ? nextLog : 'Update log is unavailable.'
}

async function loadReleaseNotes(version?: string): Promise<ReleaseNotes> {
  return await window.electronAPI.invoke('release-notes:get', version) as ReleaseNotes
}

function resolveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useUpdateLog(): UseUpdateLogResult {
  const [visible, setVisible] = useState(false)
  const [activeTab, setActiveTab] = useState<UpdateCenterTab>('releaseNotes')
  const [installedVersion, setInstalledVersion] = useState('')
  const [targetVersion, setTargetVersion] = useState<string | null>(null)
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNotes | null>(null)
  const [log, setLog] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const displayVersion = targetVersion || installedVersion

  const refreshReleaseNotes = useCallback(async (version?: string): Promise<void> => {
    setReleaseNotes(await loadReleaseNotes(version))
  }, [])

  const refreshDiagnostics = useCallback(async (): Promise<void> => {
    setLog(await loadUpdateLog())
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      if (activeTab === 'diagnostics') {
        await refreshDiagnostics()
      } else {
        await refreshReleaseNotes(displayVersion || undefined)
      }
    } catch (err) {
      setError(resolveErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [activeTab, displayVersion, refreshDiagnostics, refreshReleaseNotes])

  const close = useCallback((): void => {
    setVisible(false)
    setTargetVersion(null)
  }, [])

  const openTab = useCallback((tab: UpdateCenterTab): void => {
    setVisible(true)
    setActiveTab(tab)
  }, [])

  const openReleaseNotes = useCallback((version?: string): void => {
    setTargetVersion(version ?? null)
    openTab('releaseNotes')
  }, [openTab])

  const openDiagnostics = useCallback((): void => {
    openTab('diagnostics')
  }, [openTab])

  const checkForUpdates = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      await window.electronAPI.invoke('updater:check')
      await refreshDiagnostics()
    } catch (err) {
      setError(resolveErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [refreshDiagnostics])

  const clear = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      await window.electronAPI.invoke('updater:clear-log')
      await refreshDiagnostics()
    } catch (err) {
      setError(resolveErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [refreshDiagnostics])

  const openReleaseNotesExternal = useCallback(async (): Promise<void> => {
    await window.electronAPI.invoke('release-notes:open-external', displayVersion || releaseNotes?.version)
  }, [displayVersion, releaseNotes?.version])

  useEffect(() => {
    const unsubLog = window.electronAPI.on('show-update-log', () => {
      setTargetVersion(null)
      setVisible(true)
      setActiveTab('releaseNotes')
    })
    const unsubCheck = window.electronAPI.on('show-update-check', () => {
      setVisible(true)
      setActiveTab('diagnostics')
      void checkForUpdates()
    })
    return () => {
      unsubLog()
      unsubCheck()
    }
  }, [checkForUpdates])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const [version, settings] = await Promise.all([
          window.electronAPI.invoke('app:version') as Promise<string>,
          window.electronAPI.invoke('settings:get') as Promise<{ lastSeenReleaseNotesVersion?: string }>,
        ])
        if (cancelled) return
        setInstalledVersion(version)
        if (settings.lastSeenReleaseNotesVersion !== version) {
          setVisible(true)
          setActiveTab('releaseNotes')
          await window.electronAPI.invoke('settings:update', { lastSeenReleaseNotesVersion: version })
        }
      } catch (err) {
        if (!cancelled) setError(resolveErrorMessage(err))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    void refresh()
  }, [visible, activeTab, refresh])

  return {
    visible,
    activeTab,
    currentVersion: displayVersion,
    releaseNotes,
    log,
    loading,
    error,
    close,
    refresh,
    clear,
    checkForUpdates,
    openReleaseNotes,
    openDiagnostics,
    openReleaseNotesExternal,
    setActiveTab,
  }
}
