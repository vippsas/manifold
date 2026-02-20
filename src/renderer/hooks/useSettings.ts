import { useState, useEffect, useCallback } from 'react'
import type { ManifoldSettings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/defaults'
import { loadTheme, migrateLegacyTheme } from '../../shared/themes/registry'
import { useIpcListener } from './useIpc'

interface UseSettingsResult {
  settings: ManifoldSettings
  loading: boolean
  error: string | null
  updateSettings: (partial: Partial<ManifoldSettings>) => Promise<void>
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<ManifoldSettings>({ ...DEFAULT_SETTINGS })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSettings = async (): Promise<void> => {
      try {
        const result = (await window.electronAPI.invoke('settings:get')) as ManifoldSettings
        // Migrate legacy 'dark'/'light' values
        result.theme = migrateLegacyTheme(result.theme)
        setSettings(result)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
      } finally {
        setLoading(false)
      }
    }
    void fetchSettings()
  }, [])

  useIpcListener<ManifoldSettings>(
    'settings:changed',
    useCallback((updated: ManifoldSettings) => {
      setSettings(updated)
    }, [])
  )

  const updateSettings = useCallback(
    async (partial: Partial<ManifoldSettings>): Promise<void> => {
      setError(null)
      try {
        const updated = (await window.electronAPI.invoke(
          'settings:update',
          partial
        )) as ManifoldSettings
        setSettings(updated)
        if (partial.theme) {
          const theme = loadTheme(partial.theme)
          window.electronAPI.send('theme:changed', {
            type: theme.type,
            background: theme.cssVars['--bg-primary'],
          })
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
      }
    },
    []
  )

  return { settings, loading, error, updateSettings }
}
