import React, { useRef, useCallback, useState, useEffect } from 'react'
import * as styles from './PreviewPane.styles'
import {
  getWebviewNavigationState,
  navigateWebviewHistory,
  reloadWebview,
  stopWebview,
} from './preview-webview'

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
  scaffolding?: boolean
}

export function PreviewPane({ url, isAgentWorking, starting, scaffolding }: Props): React.JSX.Element {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const readyRef = useRef(false)
  const syncNavigationStateRef = useRef((): void => {})
  const [currentUrl, setCurrentUrl] = useState<string | null>(url)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const wasWorkingRef = useRef(isAgentWorking)

  syncNavigationStateRef.current = () => {
    const {
      currentUrl: nextUrl,
      canGoBack: nextCanGoBack,
      canGoForward: nextCanGoForward,
    } = getWebviewNavigationState(webviewRef.current, url)

    setCurrentUrl(nextUrl)
    setCanGoBack(nextCanGoBack)
    setCanGoForward(nextCanGoForward)
  }

  useEffect(() => {
    setCurrentUrl(url)
    setCanGoBack(false)
    setCanGoForward(false)
    setError(null)
    setLoading(true)
  }, [url])

  useEffect(() => {
    return () => {
      stopWebview(webviewRef.current)
      webviewRef.current = null
      readyRef.current = false
    }
  }, [])

  // Auto-reload when agent finishes (working -> not working)
  useEffect(() => {
    const wasWorking = wasWorkingRef.current
    wasWorkingRef.current = isAgentWorking
    if (wasWorking && !isAgentWorking && reloadWebview(webviewRef.current, readyRef.current)) {
      setLoading(true)
      setError(null)
    }
  }, [isAgentWorking])

  const handleStartRef = useRef((): void => {
    setLoading(true)
    setError(null)
  })
  const handleStopRef = useRef((): void => {
    setLoading(false)
    syncNavigationStateRef.current()
  })
  const handleFailRef = useRef((e: Electron.DidFailLoadEvent): void => {
    if (e.errorCode !== ERR_ABORTED) {
      setError(`Failed to load: ${e.errorDescription}`)
      setLoading(false)
    }
  })
  const handleReadyRef = useRef((): void => {
    readyRef.current = true
    syncNavigationStateRef.current()
  })
  const handleNavigateRef = useRef((_e: Electron.DidNavigateEvent): void => {
    syncNavigationStateRef.current()
  })
  const handleNavigateInPageRef = useRef((_e: Electron.DidNavigateInPageEvent): void => {
    syncNavigationStateRef.current()
  })

  const webviewCallbackRef = useCallback((node: Electron.WebviewTag | null) => {
    const prev = webviewRef.current
    if (prev) {
      stopWebview(prev)
      prev.removeEventListener('dom-ready', handleReadyRef.current)
      prev.removeEventListener('did-start-loading', handleStartRef.current)
      prev.removeEventListener('did-stop-loading', handleStopRef.current)
      prev.removeEventListener('did-fail-load', handleFailRef.current as EventListener)
      prev.removeEventListener('did-navigate', handleNavigateRef.current as EventListener)
      prev.removeEventListener('did-navigate-in-page', handleNavigateInPageRef.current as EventListener)
    }
    webviewRef.current = node
    readyRef.current = false
    if (node) {
      node.addEventListener('dom-ready', handleReadyRef.current)
      node.addEventListener('did-start-loading', handleStartRef.current)
      node.addEventListener('did-stop-loading', handleStopRef.current)
      node.addEventListener('did-fail-load', handleFailRef.current as EventListener)
      node.addEventListener('did-navigate', handleNavigateRef.current as EventListener)
      node.addEventListener('did-navigate-in-page', handleNavigateInPageRef.current as EventListener)
    }
  }, [])

  const handleBack = useCallback(() => {
    if (navigateWebviewHistory(webviewRef.current, 'back')) {
      setError(null)
      setLoading(true)
    }
  }, [])

  const handleForward = useCallback(() => {
    if (navigateWebviewHistory(webviewRef.current, 'forward')) {
      setError(null)
      setLoading(true)
    }
  }, [])

  const handleReload = useCallback(() => {
    if (reloadWebview(webviewRef.current, readyRef.current)) {
      setError(null)
      setLoading(true)
    }
  }, [])

  if (!url) {
    return (
      <div style={styles.emptyState}>
        {scaffolding ? (
          <>
            <div style={styles.spinner} />
            <span>Setting up your project...</span>
          </>
        ) : starting ? (
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
        <div style={styles.toolbarActions}>
          <button
            aria-label="Back"
            disabled={!canGoBack}
            onClick={handleBack}
            style={canGoBack ? styles.toolbarButton : styles.toolbarButtonDisabled}
            title="Back"
          >
            &#x2190;
          </button>
          <button
            aria-label="Forward"
            disabled={!canGoForward}
            onClick={handleForward}
            style={canGoForward ? styles.toolbarButton : styles.toolbarButtonDisabled}
            title="Forward"
          >
            &#x2192;
          </button>
          <button
            aria-label="Reload"
            onClick={handleReload}
            style={styles.toolbarButton}
            title="Reload"
          >
            &#x21bb;
          </button>
        </div>
        <span style={styles.urlLabel} title={currentUrl ?? url}>{currentUrl ?? url}</span>
        {loading && <span style={styles.loadingLabel}>Loading...</span>}
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
          src={currentUrl ?? url}
          style={styles.webview}
        />
      )}
    </div>
  )
}
