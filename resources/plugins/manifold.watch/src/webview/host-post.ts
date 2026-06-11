/// <reference lib="dom" />
// resources/plugins/manifold.watch/src/webview/host-post.ts
// Single funnel for webview→host messages. Module-scoped so the state modules
// (watch-panel-store, watch-preview-cache) can post `persist` without importing
// the bridge hook (which imports them — avoids an import cycle).
import type { WebviewMsg } from './protocol'

export function postToHost(msg: WebviewMsg): void {
  parent.postMessage(msg, '*')
}

/** Replacement for the builtin's localStorage writes: same keys, host storage. */
export function postPersist(key: string, value: unknown): void {
  postToHost({ type: 'persist', key, value })
}
