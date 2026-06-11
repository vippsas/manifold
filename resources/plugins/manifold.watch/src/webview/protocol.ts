// resources/plugins/manifold.watch/src/webview/protocol.ts
// Typed messages between the watch webview and the plugin host. Shared by both
// sides (type-only on the webview side; bundling drops it). `WebviewMsg` are
// webview→host; `HostMsg` are host→webview. Request/response pairs carry a
// `reqId` so the bridge can resolve single-flight promises. Run messages carry
// the owning sessionId instead: the run survives webview reloads (panel
// remounts on agent switches), so its events can't be correlated by reqId —
// the webview routes them into its per-session store by sessionId.
import type {
  WatchPeekResult,
  WatchSessionSnapshot,
  WatchSetupStatus,
  WatchVideoRunResult,
} from '../shared-types'

// Webview → Host
export type WebviewMsg =
  | { type: 'ready' }
  | { type: 'peek'; reqId: number; url: string }
  | {
      type: 'run'
      /** Pipeline source (the peek-normalized video URL — playlist params stripped). */
      url: string
      question?: string
      /** The URL as typed in the panel — the run-store session key uses it, so
       *  it must match `setUrl` for snapshots to re-attach after remounts. */
      sourceUrl?: string
    }
  | { type: 'stop' }
  | { type: 'installBinaries'; reqId: number }
  | { type: 'readFrame'; reqId: number; framePath: string }
  | { type: 'setupStatus'; reqId: number }
  | { type: 'setUrl'; url: string }
  | { type: 'improvePrompt'; reqId: number; draft: string }
  | { type: 'persist'; key: string; value: unknown }

// Host → Webview
export type HostMsg =
  | {
      type: 'init'
      sessionId: string | null
      snapshot: WatchSessionSnapshot | null
      setup: WatchSetupStatus
      persisted: Record<string, unknown>
      /** True when the host has a run in flight for `sessionId` — the
       *  webview restores its busy state from this after a reload. */
      running: boolean
      /** Last pipeline stage of that in-flight run (progress shown after reload). */
      lastStage: string | null
    }
  | { type: 'peekResult'; reqId: number; result: WatchPeekResult }
  | { type: 'runProgress'; sessionId: string; kind: 'log' | 'stage' | 'frames'; payload: unknown }
  | { type: 'runResult'; sessionId: string; result: WatchVideoRunResult }
  | { type: 'installProgress'; line: string }
  | { type: 'installResult'; reqId: number; ok: boolean; error?: string }
  | { type: 'frameData'; reqId: number; dataUrl?: string; error?: string }
  | { type: 'setupStatusResult'; reqId: number; status: WatchSetupStatus }
  | { type: 'improveResult'; reqId: number; ok: boolean; text?: string; error?: string }

const WEBVIEW_MSG_TYPES = new Set<string>([
  'ready', 'peek', 'run', 'stop', 'installBinaries',
  'readFrame', 'setupStatus', 'setUrl', 'improvePrompt', 'persist',
])

/** Runtime guard for messages arriving from the sandboxed webview (a trust
 *  boundary — the host must not cast `unknown` straight to `WebviewMsg`). */
export function isWebviewMsg(raw: unknown): raw is WebviewMsg {
  return typeof raw === 'object' && raw !== null && WEBVIEW_MSG_TYPES.has((raw as { type?: unknown }).type as string)
}
