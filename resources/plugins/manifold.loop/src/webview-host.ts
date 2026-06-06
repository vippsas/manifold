// resources/plugins/manifold.loop/src/webview-host.ts
// Builds the loop plugin's WebviewViewProvider: inlines the bundle into nonce-CSP-safe HTML,
// answers `ready` with an init snapshot, and exposes an `emit` that forwards engine events to
// the resolved view. No `manifold` import — the WebviewView is passed in (testable).
import type { WebviewViewProvider, WebviewView } from 'manifold'

export interface EngineFacade {
  getStatus(sessionId: string): Promise<unknown>
  getIterations(): Promise<unknown[]>
  getConfig(sessionId: string): Promise<unknown>
}

export interface WebviewHostOptions {
  engine: EngineFacade
  readBundle: () => string
  getActiveSessionId: () => string | null
}

/** Inline a JS bundle into HTML safely (neutralize `</script>` for the HTML parser). */
export function buildWebviewHtml(bundle: string): string {
  const safe = bundle.replace(/<\/(script)/gi, '<\\/$1')
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>html,body{margin:0;padding:0;background:var(--bg-primary,#282a36);color:var(--text-primary,#f8f8f2);font-family:var(--font-sans,system-ui)}</style>',
    '</head><body><div id="root"></div>',
    `<script>${safe}</script>`,
    '</body></html>',
  ].join('')
}

export function createWebviewHost(opts: WebviewHostOptions): {
  provider: WebviewViewProvider
  emit: (event: 'status' | 'iteration', payload: unknown) => void
} {
  let view: WebviewView | undefined

  const emit = (event: 'status' | 'iteration', payload: unknown): void => {
    if (!view) return
    if (event === 'status') view.webview.postMessage({ type: 'status', status: payload })
    else view.webview.postMessage({ type: 'iteration', iteration: payload })
  }

  const provider: WebviewViewProvider = {
    resolveWebviewView(v: WebviewView): void {
      view = v
      v.webview.html = buildWebviewHtml(opts.readBundle())
      v.webview.onDidReceiveMessage(async (raw: unknown) => {
        const msg = raw as { type?: string }
        if (msg.type === 'ready') {
          const sessionId = opts.getActiveSessionId()
          v.webview.postMessage({
            type: 'init',
            sessionId,
            status: sessionId ? await opts.engine.getStatus(sessionId) : null,
            iterations: await opts.engine.getIterations(),
            config: sessionId ? await opts.engine.getConfig(sessionId) : null,
          })
        }
      })
    },
  }

  return { provider, emit }
}
