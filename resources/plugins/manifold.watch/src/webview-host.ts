// resources/plugins/manifold.watch/src/webview-host.ts
// Builds the watch plugin's WebviewViewProvider: inlines the bundle into HTML,
// dispatches the webview message set to the injected WatchFacade, and posts the
// matching HostMsg replies (reqId-correlated). No `manifold` import (everything
// injected → testable). The host owns the run AbortController: `runPlaylist`
// creates one per run and `stop` aborts it — the facade only sees the signal.
import type { WebviewViewProvider, WebviewView } from 'manifold'
import type {
  WatchPeekResult,
  WatchPlaylistEntryInput,
  WatchPlaylistPeekResult,
  WatchPlaylistRunResult,
  WatchSessionSnapshot,
  WatchSetupStatus,
} from './shared-types'
import { isWebviewMsg, type WebviewMsg } from './webview/protocol'

export interface RunPlaylistRequest {
  entries: WatchPlaylistEntryInput[]
  sourceUrl?: string
  signal: AbortSignal
  onProgress: (entryIndex: number, kind: 'log' | 'stage' | 'frames' | 'sibling', payload: unknown) => void
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
  peekPlaylist(url: string): Promise<WatchPlaylistPeekResult>
  runPlaylist(req: RunPlaylistRequest): Promise<WatchPlaylistRunResult>
  installBinaries(onLog: (line: string) => void): Promise<{ ok: boolean; error?: string }>
  readFrame(framePath: string): Promise<string>
  setUrl(url: string): Promise<void>
  revealAgent(sessionId: string, title?: string): Promise<void>
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

export function createWebviewHost(opts: WebviewHostOptions): {
  provider: WebviewViewProvider
  refresh: () => void
} {
  const { facade } = opts
  let view: WebviewView | undefined
  let currentRun: AbortController | null = null

  const post = (msg: unknown): void => { view?.webview.postMessage(msg) }

  const sendInit = async (): Promise<void> => {
    const sessionId = facade.getActiveSessionId()
    post({
      type: 'init',
      sessionId,
      snapshot: sessionId ? await facade.getSnapshot() : null,
      setup: await facade.setupStatus(),
      persisted: await facade.getPersisted(),
    })
  }

  const runPlaylist = async (entries: WatchPlaylistEntryInput[], sourceUrl?: string): Promise<void> => {
    const ctrl = new AbortController()
    currentRun = ctrl
    try {
      const result = await facade.runPlaylist({
        entries,
        sourceUrl,
        signal: ctrl.signal,
        onProgress: (entryIndex, kind, payload) => post({ type: 'playlistProgress', entryIndex, kind, payload }),
      })
      post({ type: 'runResult', result })
    } catch (e) {
      post({ type: 'runResult', result: { ok: false, error: (e as Error).message } })
    } finally {
      if (currentRun === ctrl) currentRun = null
    }
  }

  const handle = async (msg: WebviewMsg): Promise<void> => {
    switch (msg.type) {
      case 'ready': await sendInit(); break
      case 'peek':
        post({ type: 'peekResult', reqId: msg.reqId, result: await facade.peek(msg.url) })
        break
      case 'peekPlaylist':
        post({ type: 'peekPlaylistResult', reqId: msg.reqId, result: await facade.peekPlaylist(msg.url) })
        break
      case 'runPlaylist': await runPlaylist(msg.entries, msg.sourceUrl); break
      case 'stop': currentRun?.abort(); break
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
      case 'revealAgent': await facade.revealAgent(msg.sessionId, msg.title); break
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
