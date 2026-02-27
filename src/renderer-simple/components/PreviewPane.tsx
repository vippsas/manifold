import React, { useRef, useCallback, useState, useEffect } from 'react'

interface Props {
  url: string | null
  isAgentWorking?: boolean
}

export function PreviewPane({ url, isAgentWorking }: Props): React.JSX.Element {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wasWorkingRef = useRef(isAgentWorking)

  useEffect(() => {
    setError(null)
    setLoading(true)
  }, [url])

  // Auto-reload when agent finishes (working → not working)
  useEffect(() => {
    const wasWorking = wasWorkingRef.current
    wasWorkingRef.current = isAgentWorking
    if (wasWorking && !isAgentWorking && webviewRef.current) {
      webviewRef.current.reload()
    }
  }, [isAgentWorking])

  const handleStartRef = useRef((): void => {
    setLoading(true)
    setError(null)
  })
  const handleStopRef = useRef((): void => setLoading(false))
  const handleFailRef = useRef((e: Electron.DidFailLoadEvent): void => {
    if (e.errorCode !== -3) {
      setError(`Failed to load: ${e.errorDescription}`)
      setLoading(false)
    }
  })

  const webviewCallbackRef = useCallback((node: Electron.WebviewTag | null) => {
    const prev = webviewRef.current
    if (prev) {
      prev.removeEventListener('did-start-loading', handleStartRef.current)
      prev.removeEventListener('did-stop-loading', handleStopRef.current)
      prev.removeEventListener('did-fail-load', handleFailRef.current as EventListener)
    }
    webviewRef.current = node
    if (node) {
      node.addEventListener('did-start-loading', handleStartRef.current)
      node.addEventListener('did-stop-loading', handleStopRef.current)
      node.addEventListener('did-fail-load', handleFailRef.current as EventListener)
    }
  }, [])

  const handleReload = useCallback(() => {
    if (webviewRef.current) {
      setError(null)
      setLoading(true)
      webviewRef.current.reload()
    }
  }, [])

  if (!url) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 16,
          background: 'var(--surface)',
          borderRadius: 'var(--radius)',
        }}
      >
        Preview will appear here once the app is running...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          fontSize: 12,
          color: 'var(--text-muted)',
          gap: 8,
        }}
      >
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'monospace',
          }}
        >
          {url}
        </span>
        {loading && <span style={{ fontSize: 10 }}>Loading...</span>}
        <button
          onClick={handleReload}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 14,
            padding: '2px 4px',
          }}
          title="Reload"
        >
          &#x21bb;
        </button>
      </div>
      {error ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            color: 'var(--text-muted)',
          }}
        >
          <p style={{ fontSize: 12, margin: 0 }}>{error}</p>
          <button
            onClick={handleReload}
            style={{
              padding: '4px 16px',
              fontSize: 12,
              color: '#fff',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
            }}
          >
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
