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

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleStartLoading = (): void => {
      setLoading(true)
      setError(null)
    }
    const handleStopLoading = (): void => setLoading(false)
    const handleFailLoad = (e: Electron.DidFailLoadEvent): void => {
      if (e.errorCode !== -3) {
        setError(`Failed to load: ${e.errorDescription}`)
        setLoading(false)
      }
    }
    const handleNavigate = (e: Electron.DidNavigateEvent): void => {
      setCurrentUrl(e.url)
    }

    webview.addEventListener('did-start-loading', handleStartLoading)
    webview.addEventListener('did-stop-loading', handleStopLoading)
    webview.addEventListener('did-fail-load', handleFailLoad as EventListener)
    webview.addEventListener('did-navigate', handleNavigate as EventListener)

    return () => {
      webview.removeEventListener('did-start-loading', handleStartLoading)
      webview.removeEventListener('did-stop-loading', handleStopLoading)
      webview.removeEventListener('did-fail-load', handleFailLoad as EventListener)
      webview.removeEventListener('did-navigate', handleNavigate as EventListener)
    }
  }, [error])

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
      {error ? (
        <div style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button onClick={handleReload} style={styles.retryButton}>Retry</button>
        </div>
      ) : (
        <webview
          ref={webviewRef as React.Ref<Electron.WebviewTag>}
          src={currentUrl}
          style={styles.webview}
        />
      )}
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
