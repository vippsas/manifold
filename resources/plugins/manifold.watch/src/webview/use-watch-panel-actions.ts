// resources/plugins/manifold.watch/src/webview/use-watch-panel-actions.ts
// Async click handlers (improve / install / clear-cache) for the Watch panel.
// Run state is host-owned and lives in the store; only the improve/install
// in-flight flags are component-local.
import { useCallback, useState } from 'react'
import type { useWatchPanel } from './use-watch-panel'
import { useWatchUrlPreview, clearWatchPreviewCaches } from './use-watch-url-preview'

type WatchPanelApi = ReturnType<typeof useWatchPanel>
type WatchPreview = ReturnType<typeof useWatchUrlPreview>

interface WatchPanelActionDeps {
  preview: WatchPreview
  improveQuestion: WatchPanelApi['improveQuestion']
  installBinaries: WatchPanelApi['installBinaries']
}

export interface WatchPanelActions {
  error: string | null
  setError: (value: string | null) => void
  installing: boolean
  improving: boolean
  handleImprove: () => Promise<void>
  handleClearCache: () => void
  handleInstall: () => Promise<void>
}

export function useWatchPanelActions(deps: WatchPanelActionDeps): WatchPanelActions {
  const { preview, improveQuestion, installBinaries } = deps
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [improving, setImproving] = useState(false)

  const handleImprove = async (): Promise<void> => {
    if (!preview.question.trim()) return
    setError(null)
    setImproving(true)
    try {
      const improved = await improveQuestion(preview.question)
      if (improved) preview.setQuestion(improved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Improve failed')
    } finally {
      setImproving(false)
    }
  }

  const handleClearCache = useCallback((): void => {
    // Wipe the peek + prompt caches (in-memory + host-persisted), then ask
    // the preview hook to re-peek for the current URL.
    clearWatchPreviewCaches()
    preview.forceRefresh()
  }, [preview])

  const handleInstall = async (): Promise<void> => {
    setError(null)
    setInstalling(true)
    try {
      const result = await installBinaries()
      if (!result.ok) setError(result.error ?? 'Install failed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstalling(false)
    }
  }

  return { error, setError, installing, improving, handleImprove, handleClearCache, handleInstall }
}
