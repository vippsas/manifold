import React, { useRef, useCallback, useState, useEffect } from 'react'
import * as styles from './PreviewPane.styles'

// Chromium error code -3 (ERR_ABORTED) fires on navigation cancellation; not a real error.
const ERR_ABORTED = -3

// Inject spinner keyframe once
if (typeof document !== 'undefined' && !document.getElementById('sp-keyframe')) {
  const style = document.createElement('style')
  style.id = 'sp-keyframe'
  style.textContent = '@keyframes spin { to { transform: rotate(360deg) } }'
  document.head.appendChild(style)
}

interface Props {
  url: string | null
  isAgentWorking?: boolean
  starting?: boolean
}

export function PreviewPane({ url, isAgentWorking, starting }: Props): React.JSX.Element {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const readyRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wasWorkingRef = useRef(isAgentWorking)

  useEffect(() => {
    setError(null)
    setLoading(true)
  }, [url])

  // Auto-reload when agent finishes (working -> not working)
  useEffect(() => {
    const wasWorking = wasWorkingRef.current
    wasWorkingRef.current = isAgentWorking
    if (wasWorking && !isAgentWorking && webviewRef.current && readyRef.current) {
      webviewRef.current.reload()
    }
  }, [isAgentWorking])

  const handleStartRef = useRef((): void => {
    setLoading(true)
    setError(null)
  })
  const handleStopRef = useRef((): void => setLoading(false))
  const handleFailRef = useRef((e: Electron.DidFailLoadEvent): void => {
    if (e.errorCode !== ERR_ABORTED) {
      setError(`Failed to load: ${e.errorDescription}`)
      setLoading(false)
    }
  })
  const handleReadyRef = useRef((): void => { readyRef.current = true })

  const webviewCallbackRef = useCallback((node: Electron.WebviewTag | null) => {
    const prev = webviewRef.current
    if (prev) {
      prev.removeEventListener('dom-ready', handleReadyRef.current)
      prev.removeEventListener('did-start-loading', handleStartRef.current)
      prev.removeEventListener('did-stop-loading', handleStopRef.current)
      prev.removeEventListener('did-fail-load', handleFailRef.current as EventListener)
    }
    webviewRef.current = node
    readyRef.current = false
    if (node) {
      node.addEventListener('dom-ready', handleReadyRef.current)
      node.addEventListener('did-start-loading', handleStartRef.current)
      node.addEventListener('did-stop-loading', handleStopRef.current)
      node.addEventListener('did-fail-load', handleFailRef.current as EventListener)
    }
  }, [])

  const handleReload = useCallback(() => {
    if (webviewRef.current && readyRef.current) {
      setError(null)
      setLoading(true)
      webviewRef.current.reload()
    }
  }, [])

  if (!url) {
    return (
      <div style={styles.emptyState}>
        {starting ? (
          <>
            <div style={styles.spinner} />
            <span>Starting app...</span>
          </>
        ) : (
          'Preview will appear here once the app is running...'
        )}
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.urlLabel}>{url}</span>
        {loading && <span style={{ fontSize: 10 }}>Loading...</span>}
        <button onClick={handleReload} style={styles.reloadButton} title="Reload">
          &#x21bb;
        </button>
      </div>
      {error ? (
        <div style={styles.errorContainer}>
          <p style={{ fontSize: 12, margin: 0 }}>{error}</p>
          <button onClick={handleReload} style={styles.retryButton}>
            Retry
          </button>
        </div>
      ) : (
        <webview
          ref={webviewCallbackRef as React.Ref<Electron.WebviewTag>}
          src={url}
          style={{ flex: 1, border: 'none' }}
        />
      )}
    </div>
  )
}
