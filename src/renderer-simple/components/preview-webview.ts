interface ReloadableWebview {
  isConnected: boolean
  reload: () => void
}

interface StoppableWebview {
  isConnected: boolean
  stop?: () => void
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
