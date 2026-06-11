// resources/plugins/manifold.watch/src/webview-host.ts
// Builds the watch plugin's WebviewViewProvider: inlines the bundle into HTML,
// dispatches the webview message set to the injected WatchFacade, and posts the
// matching HostMsg replies (reqId-correlated; run events sessionId-tagged).
// No `manifold` import (everything injected → testable). The host owns the
// in-flight runs: one AbortController per session, kept here — not in the
// webview — so a run survives webview reloads (panel remounts on agent
// switches) and `init` can restore the busy state.
import type { WebviewViewProvider, WebviewView } from 'manifold'
import type {
  WatchPeekResult,
  WatchSessionSnapshot,
  WatchSetupStatus,
  WatchVideoRunResult,
} from './shared-types'
import { isWebviewMsg, type WebviewMsg } from './webview/protocol'

export interface RunVideoRequest {
  /** The base session the run belongs to (captured when Run was clicked). */
  sessionId: string
  url: string
  question?: string
  /** The panel URL the run is recorded under (defaults to `url`). */
  sourceUrl?: string
  signal: AbortSignal
  onProgress: (kind: 'log' | 'stage' | 'frames', payload: unknown) => void
}

/** Everything the webview host needs from the watch pipeline + manifold API.
 *  Implemented by createWatchFacade (facade.ts); faked in tests. */
export interface WatchFacade {
  getActiveSessionId(): string | null
  getSnapshot(): Promise<WatchSessionSnapshot | null>
  setupStatus(): Promise<WatchSetupStatus>
  getPersisted(): Promise<Record<string, unknown>>
  persist(key: string, value: unknown): Promise<void>
  peek(url: string): Promise<WatchPeekResult>
  runVideo(req: RunVideoRequest): Promise<WatchVideoRunResult>
  installBinaries(onLog: (line: string) => void): Promise<{ ok: boolean; error?: string }>
  readFrame(framePath: string): Promise<string>
  setUrl(url: string): Promise<void>
  improvePrompt(draft: string): Promise<string>
}

export interface WebviewHostOptions {
  facade: WatchFacade
  readBundle: () => string
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

interface ActiveRun {
  ctrl: AbortController
  lastStage: string | null
}

export function createWebviewHost(opts: WebviewHostOptions): {
  provider: WebviewViewProvider
  refresh: () => void
} {
  const { facade } = opts
  let view: WebviewView | undefined
  const runs = new Map<string, ActiveRun>()

  const post = (msg: unknown): void => { view?.webview.postMessage(msg) }

  const sendInit = async (): Promise<void> => {
    const sessionId = facade.getActiveSessionId()
    const active = sessionId ? runs.get(sessionId) : undefined
    post({
      type: 'init',
      sessionId,
      snapshot: sessionId ? await facade.getSnapshot() : null,
      setup: await facade.setupStatus(),
      persisted: await facade.getPersisted(),
      running: active !== undefined,
      lastStage: active?.lastStage ?? null,
    })
  }

  const runVideo = async (url: string, question?: string, sourceUrl?: string): Promise<void> => {
    const sessionId = facade.getActiveSessionId()
    if (!sessionId) return
    if (runs.has(sessionId)) {
      post({ type: 'runResult', sessionId, result: { ok: false, error: 'A run is already in progress' } })
      return
    }
    const run: ActiveRun = { ctrl: new AbortController(), lastStage: null }
    runs.set(sessionId, run)
    try {
      const result = await facade.runVideo({
        sessionId,
        url,
        question,
        sourceUrl,
        signal: run.ctrl.signal,
        onProgress: (kind, payload) => {
          if (kind === 'stage') run.lastStage = String(payload)
          post({ type: 'runProgress', sessionId, kind, payload })
        },
      })
      post({ type: 'runResult', sessionId, result })
    } catch (e) {
      post({ type: 'runResult', sessionId, result: { ok: false, error: (e as Error).message } })
    } finally {
      runs.delete(sessionId)
    }
  }

  const handle = async (msg: WebviewMsg): Promise<void> => {
    switch (msg.type) {
      case 'ready': await sendInit(); break
      case 'peek':
        post({ type: 'peekResult', reqId: msg.reqId, result: await facade.peek(msg.url) })
        break
      case 'run': await runVideo(msg.url, msg.question, msg.sourceUrl); break
      case 'stop': {
        const sessionId = facade.getActiveSessionId()
        if (sessionId) runs.get(sessionId)?.ctrl.abort()
        break
      }
      case 'installBinaries': {
        const res = await facade.installBinaries((line) => post({ type: 'installProgress', line }))
        post({ type: 'installResult', reqId: msg.reqId, ok: res.ok, error: res.error })
        break
      }
      case 'readFrame':
        try { post({ type: 'frameData', reqId: msg.reqId, dataUrl: await facade.readFrame(msg.framePath) }) }
        catch (e) { post({ type: 'frameData', reqId: msg.reqId, error: (e as Error).message }) }
        break
      case 'setupStatus':
        post({ type: 'setupStatusResult', reqId: msg.reqId, status: await facade.setupStatus() })
        break
      case 'setUrl': await facade.setUrl(msg.url); break
      case 'improvePrompt':
        try { post({ type: 'improveResult', reqId: msg.reqId, ok: true, text: await facade.improvePrompt(msg.draft) }) }
        catch (e) { post({ type: 'improveResult', reqId: msg.reqId, ok: false, error: (e as Error).message }) }
        break
      case 'persist': await facade.persist(msg.key, msg.value); break
    }
  }

  const provider: WebviewViewProvider = {
    resolveWebviewView(v: WebviewView): void {
      view = v
      v.webview.html = buildWebviewHtml(opts.readBundle())
      v.webview.onDidReceiveMessage((raw: unknown) => { if (isWebviewMsg(raw)) void handle(raw) })
    },
  }

  return { provider, refresh: () => { if (view) void sendInit() } }
}
