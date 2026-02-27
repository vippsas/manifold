import { useState, useCallback } from 'react'
import { useIpcListener } from './useIpc'

interface PreviewUrlEvent {
  sessionId: string
  url: string
}

export interface UseWebPreviewResult {
  previewUrl: string | null
  openPreview: (url: string) => void
  closePreview: () => void
}

export function useWebPreview(sessionId: string | null): UseWebPreviewResult {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useIpcListener<PreviewUrlEvent>(
    'preview:url-detected',
    useCallback(
      (event: PreviewUrlEvent) => {
        if (event.sessionId === sessionId && !previewUrl) {
          setPreviewUrl(event.url)
        }
      },
      [sessionId, previewUrl]
    )
  )

  const openPreview = useCallback((url: string) => {
    setPreviewUrl(url)
  }, [])

  const closePreview = useCallback(() => {
    setPreviewUrl(null)
  }, [])

  return { previewUrl, openPreview, closePreview }
}
