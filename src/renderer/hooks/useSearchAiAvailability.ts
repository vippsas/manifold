import { useCallback, useEffect, useState } from 'react'
import type { ManifoldSettings } from '../../shared/types'
import { useIpcListener } from './useIpc'

export function useSearchAiAvailability(): boolean {
  const [canAskAi, setCanAskAi] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async (): Promise<void> => {
      try {
        const settings = await window.electronAPI.invoke('settings:get') as ManifoldSettings
        if (!cancelled) {
          setCanAskAi(isAiAnswerAvailable(settings))
        }
      } catch {
        if (!cancelled) {
          setCanAskAi(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useIpcListener<ManifoldSettings>('settings:changed', useCallback((settings) => {
    setCanAskAi(isAiAnswerAvailable(settings))
  }, []))

  return canAskAi
}

function isAiAnswerAvailable(settings: ManifoldSettings): boolean {
  return settings.search?.ai.enabled === true && settings.search.ai.mode === 'answer'
}
