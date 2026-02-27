import { useState, useEffect, useCallback, useRef } from 'react'

interface PreviewUrlEvent {
  sessionId: string
  url: string
}

export function usePreview(sessionId: string | null): {
  previewUrl: string | null
  liveUrl: string | null
  setLiveUrl: (url: string) => void
} {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const previewUrlRef = useRef(previewUrl)
  previewUrlRef.current = previewUrl

  useEffect(() => {
    setPreviewUrl(null)
    setLiveUrl(null)
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    const unsub = window.electronAPI.on('preview:url-detected', (event: unknown) => {
      const e = event as PreviewUrlEvent
      if (e.sessionId === sessionId && !previewUrlRef.current) {
        setPreviewUrl(e.url)
      }
    })
    return unsub
  }, [sessionId])

  return {
    previewUrl: liveUrl ?? previewUrl,
    liveUrl,
    setLiveUrl: useCallback((url: string) => setLiveUrl(url), []),
  }
}
