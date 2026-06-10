// resources/plugins/manifold.watch/src/webview/protocol.ts
// Typed messages between the watch webview and the plugin host. Shared by both
// sides (type-only on the webview side; bundling drops it). `WebviewMsg` are
// webview→host; `HostMsg` are host→webview. Request/response pairs carry a
// `reqId` so the bridge can resolve single-flight promises; `runPlaylist` has
// no reqId — at most one run is in flight and `runResult` resolves it.
import type {
  WatchPeekResult,
  WatchPlaylistEntryInput,
  WatchPlaylistPeekResult,
  WatchPlaylistRunResult,
  WatchSessionSnapshot,
  WatchSetupStatus,
} from '../shared-types'

// Webview → Host
export type WebviewMsg =
  | { type: 'ready' }
  | { type: 'peek'; reqId: number; url: string }
  | { type: 'peekPlaylist'; reqId: number; url: string }
  | { type: 'runPlaylist'; entries: WatchPlaylistEntryInput[]; sourceUrl?: string }
  | { type: 'stop' }
  | { type: 'installBinaries'; reqId: number }
  | { type: 'readFrame'; reqId: number; framePath: string }
  | { type: 'setupStatus'; reqId: number }
  | { type: 'setUrl'; url: string }
  | { type: 'revealAgent'; sessionId: string; title?: string }
  | { type: 'improvePrompt'; reqId: number; draft: string }
  | { type: 'persist'; key: string; value: unknown }

// Host → Webview
export type HostMsg =
  | { type: 'init'; sessionId: string | null; snapshot: WatchSessionSnapshot | null; setup: WatchSetupStatus; persisted: Record<string, unknown> }
  | { type: 'peekResult'; reqId: number; result: WatchPeekResult }
  | { type: 'peekPlaylistResult'; reqId: number; result: WatchPlaylistPeekResult }
  | { type: 'runResult'; result: WatchPlaylistRunResult }
  | { type: 'playlistProgress'; entryIndex: number; kind: 'log' | 'stage' | 'frames' | 'sibling'; payload: unknown }
  | { type: 'installProgress'; line: string }
  | { type: 'installResult'; reqId: number; ok: boolean; error?: string }
  | { type: 'frameData'; reqId: number; dataUrl?: string; error?: string }
  | { type: 'setupStatusResult'; reqId: number; status: WatchSetupStatus }
  | { type: 'improveResult'; reqId: number; ok: boolean; text?: string; error?: string }

const WEBVIEW_MSG_TYPES = new Set<string>([
  'ready', 'peek', 'peekPlaylist', 'runPlaylist', 'stop', 'installBinaries',
  'readFrame', 'setupStatus', 'setUrl', 'revealAgent', 'improvePrompt', 'persist',
])

/** Runtime guard for messages arriving from the sandboxed webview (a trust
 *  boundary — the host must not cast `unknown` straight to `WebviewMsg`). */
export function isWebviewMsg(raw: unknown): raw is WebviewMsg {
  return typeof raw === 'object' && raw !== null && WEBVIEW_MSG_TYPES.has((raw as { type?: unknown }).type as string)
}
