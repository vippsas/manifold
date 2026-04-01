interface ReloadableWebview {
  isConnected: boolean
  reload: () => void
}

interface HistoryWebview {
  isConnected: boolean
  canGoBack?: () => boolean
  canGoForward?: () => boolean
  goBack?: () => void
  goForward?: () => void
  getURL?: () => string
}

interface StoppableWebview {
  isConnected: boolean
  stop?: () => void
}

export interface WebviewNavigationState {
  canGoBack: boolean
  canGoForward: boolean
  currentUrl: string | null
}

export function stopWebview(webview: StoppableWebview | null): void {
  if (!webview?.isConnected || typeof webview.stop !== 'function') return
  try {
    webview.stop()
  } catch {
    // Chromium guest teardown can race with unmount; ignore cleanup failures.
  }
}

export function reloadWebview(webview: ReloadableWebview | null, ready: boolean): boolean {
  if (!webview?.isConnected || !ready) return false
  try {
    webview.reload()
    return true
  } catch {
    return false
  }
}

export function getWebviewNavigationState(
  webview: HistoryWebview | null,
  fallbackUrl: string | null,
): WebviewNavigationState {
  if (!webview?.isConnected) {
    return {
      canGoBack: false,
      canGoForward: false,
      currentUrl: fallbackUrl,
    }
  }

  try {
    return {
      canGoBack: typeof webview.canGoBack === 'function' ? webview.canGoBack() : false,
      canGoForward: typeof webview.canGoForward === 'function' ? webview.canGoForward() : false,
      currentUrl: typeof webview.getURL === 'function' ? webview.getURL() || fallbackUrl : fallbackUrl,
    }
  } catch {
    return {
      canGoBack: false,
      canGoForward: false,
      currentUrl: fallbackUrl,
    }
  }
}

export function navigateWebviewHistory(
  webview: HistoryWebview | null,
  direction: 'back' | 'forward',
): boolean {
  if (!webview?.isConnected) return false

  const canNavigate = direction === 'back'
    ? typeof webview.canGoBack === 'function' && webview.canGoBack()
    : typeof webview.canGoForward === 'function' && webview.canGoForward()
  const navigate = direction === 'back' ? webview.goBack : webview.goForward

  if (!canNavigate || typeof navigate !== 'function') return false

  try {
    navigate.call(webview)
    return true
  } catch {
    return false
  }
}
