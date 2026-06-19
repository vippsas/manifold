import type { WebviewView, WebviewViewProvider, VerdictRecord } from 'manifold'
import { isWebviewMsg } from './protocol'

export interface StatisticsHostOptions {
  readBundle: () => string
  /** Active project id whose verdicts to show (null = no project selected). */
  activeProjectId: () => string | null
  /** Read recorded verdicts for a project (most-recent-capped read path). */
  list: (projectId: string) => Promise<VerdictRecord[]>
  /** Open a PR URL in the browser on behalf of the sandboxed webview. */
  openExternal: (url: string) => void
  /** Confirm the destructive reset via a native dialog. Resolves true to proceed. */
  confirmReset: (projectId: string) => Promise<boolean>
  /** Delete all captured verdicts for a project. */
  clearProject: (projectId: string) => Promise<void>
}

/** Inline the IIFE bundle as a script tag (escaping `</script>` so the parser can't break out). */
export function buildWebviewHtml(bundle: string): string {
  const safe = bundle.replace(/<\/(script)/gi, '<\\/$1')
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>html,body{margin:0;padding:0;height:100%;background:var(--bg-primary,#1a1b26);color:var(--text-primary,#e6e6e6);font-family:var(--font-sans,system-ui)}</style>',
    '</head><body><div id="root"></div>',
    `<script>${safe}</script>`,
    '</body></html>',
  ].join('')
}

export function createWebviewHost(opts: StatisticsHostOptions): { provider: WebviewViewProvider; refresh: () => void } {
  let view: WebviewView | undefined
  const post = (msg: unknown): void => { view?.webview.postMessage(msg) }

  const sendInit = async (): Promise<void> => {
    const projectId = opts.activeProjectId()
    if (!projectId) { post({ type: 'init', records: [], projectId: null, error: null }); return }
    try {
      const records = await opts.list(projectId)
      post({ type: 'init', records, projectId, error: null })
    } catch (e) {
      post({ type: 'init', records: [], projectId, error: (e as Error).message })
    }
  }

  // Confirm (native dialog) then delete the active project's verdicts and refresh.
  const handleReset = async (): Promise<void> => {
    const projectId = opts.activeProjectId()
    if (!projectId) return
    if (!(await opts.confirmReset(projectId))) return
    await opts.clearProject(projectId)
    await sendInit()
  }

  const provider: WebviewViewProvider = {
    resolveWebviewView(v: WebviewView): void {
      view = v
      v.webview.html = buildWebviewHtml(opts.readBundle())
      v.webview.onDidReceiveMessage((raw: unknown) => {
        if (!isWebviewMsg(raw)) return
        if (raw.type === 'open-external') { opts.openExternal(raw.url); return }
        if (raw.type === 'reset') { void handleReset(); return }
        // 'ready' (initial mount) and 'refresh' (button) re-read the active project.
        void sendInit()
      })
    },
  }

  return { provider, refresh: () => { void sendInit() } }
}
