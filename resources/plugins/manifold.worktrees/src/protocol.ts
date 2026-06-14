import type { WorktreeOverviewEntry, BranchOverviewEntry } from 'manifold'

/** host → webview. `focusRepo` is the repo the user came from (default-expanded + scrolled-to). */
export type HostMsg = {
  type: 'init'
  entries: WorktreeOverviewEntry[]
  branches: BranchOverviewEntry[]
  focusRepo?: string | null
  error?: string | null
}

/** webview → host */
export type WebviewMsg =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'deleteBranch'; projectId: string; branch: string }
  | { type: 'deleteAllBranches'; projectId: string; repo: string; count: number }

const WEBVIEW_MSG_TYPES = new Set<string>(['ready', 'refresh', 'deleteBranch', 'deleteAllBranches'])

/** Trust-boundary guard: the host must not cast `unknown` straight to WebviewMsg. */
export function isWebviewMsg(raw: unknown): raw is WebviewMsg {
  return typeof raw === 'object' && raw !== null && WEBVIEW_MSG_TYPES.has((raw as { type?: unknown }).type as string)
}
