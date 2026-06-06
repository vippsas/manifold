// resources/plugins/manifold.loop/src/webview-host.ts
// Builds the loop plugin's WebviewViewProvider: inlines the bundle into nonce-CSP-safe HTML,
// dispatches the full webview message set to the engine + injected manifold-backed callbacks,
// and bridges engine events to the view. No `manifold` import (everything injected → testable).
import type { WebviewViewProvider, WebviewView } from 'manifold'
import type { LoopConfig } from './types'
import type { WebviewMsg } from './webview/protocol'

export interface EngineFacade {
  getStatus(sessionId: string): Promise<unknown>
  getStatusSync(sessionId: string): unknown
  getIterations(): Promise<unknown[]>
  getConfig(sessionId: string): Promise<unknown>
  start(config: LoopConfig): Promise<void>
  stop(sessionId: string): Promise<void>
  setConfig(sessionId: string, config: LoopConfig): Promise<unknown>
  restoreBest(sessionId: string): Promise<{ sha: string }>
  clear(sessionId: string): Promise<unknown>
}

export interface WebviewHostOptions {
  engine: EngineFacade
  readBundle: () => string
  getActiveSessionId: () => string | null
  confirmClear: () => Promise<boolean>
  improveWithAi: (a: { draft: string; evalCommand: string; targetGlobs: string }) => Promise<string>
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
  refresh: () => void
} {
  let view: WebviewView | undefined

  const post = (msg: unknown): void => { view?.webview.postMessage(msg) }

  const emit = (event: 'status' | 'iteration', payload: unknown): void => {
    if (event === 'status') post({ type: 'status', status: payload })
    else post({ type: 'iteration', iteration: payload })
  }

  const sendInit = async (): Promise<void> => {
    const sessionId = opts.getActiveSessionId()
    post({
      type: 'init',
      sessionId,
      status: sessionId ? await opts.engine.getStatus(sessionId) : null,
      iterations: await opts.engine.getIterations(),
      config: sessionId ? await opts.engine.getConfig(sessionId) : null,
    })
  }

  const handle = async (msg: WebviewMsg): Promise<void> => {
    const sessionId = opts.getActiveSessionId()
    switch (msg.type) {
      case 'ready': await sendInit(); break
      case 'start': void opts.engine.start(msg.config); break
      case 'stop': if (sessionId) await opts.engine.stop(sessionId); break
      case 'saveConfig': if (sessionId) await opts.engine.setConfig(sessionId, msg.config); break
      case 'restoreBest':
        if (!sessionId) { post({ type: 'restoreResult', ok: false, error: 'no active session' }); break }
        try { const { sha } = await opts.engine.restoreBest(sessionId); post({ type: 'restoreResult', ok: true, sha }) }
        catch (e) { post({ type: 'restoreResult', ok: false, error: (e as Error).message }) }
        break
      case 'clearRequest':
        if (sessionId && (await opts.confirmClear())) { await opts.engine.clear(sessionId); await sendInit() }
        break
      case 'improveWithAi':
        try { const text = await opts.improveWithAi({ draft: msg.draft, evalCommand: msg.evalCommand, targetGlobs: msg.targetGlobs }); post({ type: 'aiResult', ok: true, text }) }
        catch (e) { post({ type: 'aiResult', ok: false, error: (e as Error).message }) }
        break
    }
  }

  const provider: WebviewViewProvider = {
    resolveWebviewView(v: WebviewView): void {
      view = v
      v.webview.html = buildWebviewHtml(opts.readBundle())
      v.webview.onDidReceiveMessage((raw: unknown) => { void handle(raw as WebviewMsg) })
    },
  }

  return { provider, emit, refresh: () => { void sendInit() } }
}
