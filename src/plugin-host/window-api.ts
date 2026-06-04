// src/plugin-host/window-api.ts
import { HOST_WINDOW, type RpcEndpoint } from '../shared/plugins/rpc'
import type { Disposable, WebviewView, WebviewViewProvider } from '../shared/plugins/api-types'

interface HostWindowProxy {
  $setHtml(viewId: string, html: string): Promise<void>
  $postToWebview(viewId: string, message: unknown): Promise<void>
}

/** Builds the `manifold.window` API and the host-side view-resolution logic. */
export function createWindowApi(endpoint: RpcEndpoint): {
  windowApi: { registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable }
  resolveView(viewId: string): Promise<void>
  deliverMessage(viewId: string, message: unknown): void
} {
  const host = endpoint.getProxy<HostWindowProxy>(HOST_WINDOW)
  const providers = new Map<string, WebviewViewProvider>()
  const listeners = new Map<string, Set<(m: unknown) => void>>()

  const windowApi = {
    registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable {
      providers.set(viewId, provider)
      return { dispose: () => { providers.delete(viewId); listeners.delete(viewId) } }
    },
  }

  async function resolveView(viewId: string): Promise<void> {
    const provider = providers.get(viewId)
    if (!provider) return
    const viewListeners = new Set<(m: unknown) => void>()
    listeners.set(viewId, viewListeners)
    let html = ''
    const view: WebviewView = {
      webview: {
        get html() { return html },
        set html(value: string) { html = value; void host.$setHtml(viewId, value) },
        postMessage(message: unknown) { void host.$postToWebview(viewId, message) },
        onDidReceiveMessage(listener) { viewListeners.add(listener); return { dispose: () => viewListeners.delete(listener) } },
      },
    }
    await provider.resolveWebviewView(view)
  }

  function deliverMessage(viewId: string, message: unknown): void {
    const set = listeners.get(viewId)
    if (!set) return
    for (const listener of set) listener(message)
  }

  return { windowApi, resolveView, deliverMessage }
}
