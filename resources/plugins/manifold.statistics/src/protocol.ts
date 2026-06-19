import type { ProjectVerdicts } from 'manifold'

/** host → webview. All captured verdicts grouped by repo (all-projects view). */
export type HostMsg = {
  type: 'init'
  groups: ProjectVerdicts[]
  error?: string | null
}

/**
 * webview → host. `ready`/`refresh` trigger a fresh all-projects read;
 * `open-external` asks the host to open a PR URL in the browser (the sandboxed
 * webview can't navigate out on its own).
 */
export type WebviewMsg =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'open-external'; url: string }

/** Trust-boundary guard: the host must not cast `unknown` straight to WebviewMsg. */
export function isWebviewMsg(raw: unknown): raw is WebviewMsg {
  if (typeof raw !== 'object' || raw === null) return false
  const type = (raw as { type?: unknown }).type
  if (type === 'ready' || type === 'refresh') return true
  if (type === 'open-external') return typeof (raw as { url?: unknown }).url === 'string'
  return false
}
