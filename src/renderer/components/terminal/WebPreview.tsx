/// <reference types="electron" />
import React, { useRef, useCallback, useState, useEffect } from 'react'

interface WebPreviewProps {
  url: string
}

export function WebPreview({ url }: WebPreviewProps): React.JSX.Element {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [currentUrl, setCurrentUrl] = useState(url)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCurrentUrl(url)
    setError(null)
    setLoading(true)
  }, [url])

  const webviewCallbackRef = useCallback((node: Electron.WebviewTag | null) => {
    const prev = webviewRef.current
    if (prev) {
      prev.removeEventListener('did-start-loading', handleStartLoadingRef.current)
      prev.removeEventListener('did-stop-loading', handleStopLoadingRef.current)
      prev.removeEventListener('did-fail-load', handleFailLoadRef.current as EventListener)
      prev.removeEventListener('did-navigate', handleNavigateRef.current as EventListener)
      prev.removeEventListener('render-process-gone', handleCrashRef.current as EventListener)
    }
    webviewRef.current = node
    if (node) {
      node.addEventListener('did-start-loading', handleStartLoadingRef.current)
      node.addEventListener('did-stop-loading', handleStopLoadingRef.current)
      node.addEventListener('did-fail-load', handleFailLoadRef.current as EventListener)
      node.addEventListener('did-navigate', handleNavigateRef.current as EventListener)
      node.addEventListener('render-process-gone', handleCrashRef.current as EventListener)
    }
  }, [])

  const handleStartLoadingRef = useRef((): void => {
    setLoading(true)
    setError(null)
  })
  const handleStopLoadingRef = useRef((): void => setLoading(false))
  const handleFailLoadRef = useRef((e: Electron.DidFailLoadEvent): void => {
    if (e.errorCode !== -3) {
      setError(`Failed to load: ${e.errorDescription}`)
      setLoading(false)
    }
  })
  const handleNavigateRef = useRef((e: Electron.DidNavigateEvent): void => {
    setCurrentUrl(e.url)
  })
  const handleCrashRef = useRef((_e: Electron.RenderProcessGoneEvent): void => {
    setError('The preview process crashed unexpectedly. Click Retry to reload.')
    setLoading(false)
  })

  const handleReload = useCallback(() => {
    const webview = webviewRef.current
    if (webview) {
      setError(null)
      setLoading(true)
      webview.reload()
    }
  }, [])

  const handleOpenExternal = useCallback(() => {
    window.open(currentUrl, '_blank')
  }, [currentUrl])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.url} title={currentUrl}>{currentUrl}</span>
        <div style={styles.actions}>
          {loading && <span style={styles.loading}>Loading...</span>}
          <button onClick={handleReload} style={styles.button} title="Reload">
            &#x21bb;
          </button>
          <button onClick={handleOpenExternal} style={styles.button} title="Open in browser">
            &#x2197;
          </button>
        </div>
      </div>
      {error && (
        <div style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button onClick={handleReload} style={styles.retryButton}>Retry</button>
        </div>
      )}
      <webview
        ref={webviewCallbackRef as React.Ref<Electron.WebviewTag>}
        src={currentUrl}
        style={{ ...styles.webview, display: error ? 'none' : 'flex' }}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--bg-primary)',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
    borderBottom: '1px solid var(--border)',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    gap: '8px',
    flexShrink: 0,
  },
  url: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
    fontFamily: 'monospace',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  loading: {
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
  button: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '2px 4px',
    borderRadius: '3px',
  },
  webview: {
    flex: 1,
    border: 'none',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: '12px',
    color: 'var(--text-muted)',
  },
  errorText: {
    fontSize: '12px',
    margin: 0,
  },
  retryButton: {
    padding: '4px 16px',
    fontSize: '12px',
    color: 'var(--bg-primary)',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
}
