import { useState, useEffect, useCallback } from 'react'

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

  useEffect(() => {
    setPreviewUrl(null)
    setLiveUrl(null)
  }, [sessionId])

  // Fetch any URL that was already detected before we subscribed
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    window.electronAPI.invoke('simple:get-preview-url', sessionId).then((url) => {
      if (cancelled || !url) return
      setPreviewUrl((prev) => prev ?? (url as string))
    })
    return () => { cancelled = true }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    const unsub = window.electronAPI.on('preview:url-detected', (event: unknown) => {
      const e = event as PreviewUrlEvent
      if (e.sessionId === sessionId) {
        // Only accept the first detected URL per session
        setPreviewUrl((prev) => prev ?? e.url)
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
