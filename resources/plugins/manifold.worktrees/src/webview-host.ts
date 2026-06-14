import type { WebviewView, WebviewViewProvider, WorktreeOverviewEntry, BranchOverviewEntry } from 'manifold'
import { isWebviewMsg } from './protocol'

export interface WorktreesHostOptions {
  readBundle: () => string
  list: () => Promise<WorktreeOverviewEntry[]>
  listBranches: () => Promise<BranchOverviewEntry[]>
  deleteMergedBranch: (projectId: string, branch: string) => Promise<void>
  /** Name of the repo the user came from, to default-expand + scroll to it. */
  activeProjectName: () => string | null
}

/** Inline the IIFE bundle as a script tag (escaping `</script>` so the parser can't break out). */
export function buildWebviewHtml(bundle: string): string {
  const safe = bundle.replace(/<\/(script)/gi, '<\\/$1')
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>html,body{margin:0;padding:0;background:var(--bg-primary,#1a1b26);color:var(--text-primary,#e6e6e6);font-family:var(--font-sans,system-ui)}</style>',
    '</head><body><div id="root"></div>',
    `<script>${safe}</script>`,
    '</body></html>',
  ].join('')
}

export function createWebviewHost(opts: WorktreesHostOptions): { provider: WebviewViewProvider; refresh: () => void } {
  let view: WebviewView | undefined
  const post = (msg: unknown): void => { view?.webview.postMessage(msg) }

  const sendInit = async (): Promise<void> => {
    try {
      const [entries, branches] = await Promise.all([opts.list(), opts.listBranches()])
      post({ type: 'init', entries, branches, focusRepo: opts.activeProjectName(), error: null })
    } catch (e) {
      post({ type: 'init', entries: [], branches: [], focusRepo: null, error: (e as Error).message })
    }
  }

  const handleDelete = async (projectId: string, branch: string): Promise<void> => {
    // git `-d` is the safety net (refuses unmerged/checked-out). On failure, re-init brings the
    // row back so the user can see it wasn't deleted; log so there's a trace either way.
    try { await opts.deleteMergedBranch(projectId, branch) }
    catch (e) { console.error('[worktrees] deleteMergedBranch failed:', (e as Error).message) }
    finally { await sendInit() }
  }

  const provider: WebviewViewProvider = {
    resolveWebviewView(v: WebviewView): void {
      view = v
      v.webview.html = buildWebviewHtml(opts.readBundle())
      v.webview.onDidReceiveMessage((raw: unknown) => {
        if (!isWebviewMsg(raw)) return
        if (raw.type === 'deleteBranch') { void handleDelete(raw.projectId, raw.branch); return }
        void sendInit()
      })
    },
  }

  return { provider, refresh: () => { void sendInit() } }
}
