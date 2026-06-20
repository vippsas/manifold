import type { WebviewView, WebviewViewProvider, ProjectVerdicts, VerifyPullRequestsResult } from 'manifold'
import { isWebviewMsg } from './protocol'

export interface StatisticsHostOptions {
  readBundle: () => string
  /** Read all captured verdicts grouped by repo (all-projects view). */
  listAll: () => Promise<ProjectVerdicts[]>
  /** Open a PR URL in the browser on behalf of the sandboxed webview. */
  openExternal: (url: string) => void
  /** Confirm (native dialog) the destructive reset of one repo. Resolves true to proceed. */
  confirmReset: (projectId: string) => Promise<boolean>
  /** Delete all captured verdicts for one repo. */
  clearProject: (projectId: string) => Promise<void>
  /** Re-check captured open PRs and update stale verdicts. */
  verifyPullRequests: () => Promise<VerifyPullRequestsResult>
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

  const sendInit = async (verifyResult: VerifyPullRequestsResult | null = null): Promise<void> => {
    try {
      const groups = await opts.listAll()
      post({ type: 'init', groups, error: null, verifyResult })
    } catch (e) {
      post({ type: 'init', groups: [], error: (e as Error).message, verifyResult })
    }
  }

  // Confirm (native dialog) then delete one repo's verdicts and refresh.
  const handleReset = async (projectId: string): Promise<void> => {
    if (!(await opts.confirmReset(projectId))) return
    await opts.clearProject(projectId)
    await sendInit()
  }

  const handleVerifyPullRequests = async (): Promise<void> => {
    try {
      const result = await opts.verifyPullRequests()
      await sendInit(result)
    } catch (e) {
      post({ type: 'init', groups: [], error: (e as Error).message, verifyResult: null })
    }
  }

  const provider: WebviewViewProvider = {
    resolveWebviewView(v: WebviewView): void {
      view = v
      v.webview.html = buildWebviewHtml(opts.readBundle())
      v.webview.onDidReceiveMessage((raw: unknown) => {
        if (!isWebviewMsg(raw)) return
        if (raw.type === 'open-external') { opts.openExternal(raw.url); return }
        if (raw.type === 'reset') { void handleReset(raw.projectId); return }
        if (raw.type === 'verify-prs') { void handleVerifyPullRequests(); return }
        // 'ready' (initial mount) and 'refresh' (button) re-read all projects.
        void sendInit()
      })
    },
  }

  return { provider, refresh: () => { void sendInit() } }
}
