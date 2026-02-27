import { useState, useCallback, useEffect, useRef } from 'react'
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
  const previewUrlRef = useRef(previewUrl)
  previewUrlRef.current = previewUrl

  // Clear preview when session changes
  useEffect(() => {
    setPreviewUrl(null)
  }, [sessionId])

  useIpcListener<PreviewUrlEvent>(
    'preview:url-detected',
    useCallback(
      (event: PreviewUrlEvent) => {
        if (event.sessionId === sessionId && !previewUrlRef.current) {
          setPreviewUrl(event.url)
        }
      },
      [sessionId]
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
