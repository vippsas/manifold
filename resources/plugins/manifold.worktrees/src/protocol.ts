import type { WorktreeOverviewEntry, BranchOverviewEntry } from 'manifold'

/** host → webview */
export type HostMsg = { type: 'init'; entries: WorktreeOverviewEntry[]; branches: BranchOverviewEntry[]; error?: string | null }

/** webview → host */
export type WebviewMsg = { type: 'ready' } | { type: 'refresh' }

const WEBVIEW_MSG_TYPES = new Set<string>(['ready', 'refresh'])

/** Trust-boundary guard: the host must not cast `unknown` straight to WebviewMsg. */
export function isWebviewMsg(raw: unknown): raw is WebviewMsg {
  return typeof raw === 'object' && raw !== null && WEBVIEW_MSG_TYPES.has((raw as { type?: unknown }).type as string)
}
