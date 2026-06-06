// resources/plugins/manifold.loop/src/webview/protocol.ts
// Typed messages between the loop webview and the plugin host. Shared by both sides
// (type-only on the webview side; bundling drops it). `HostMsg` are host→webview;
// `WebviewMsg` are webview→host. `restoreResult`/`aiResult` resolve single-flight
// promises in use-loop-bridge; `startResult` reverts the optimistic "running" state
// when start() fails; the rest feed the `applyHostMsg` reducer.
import type { LoopConfig, LoopIteration, LoopStatus } from '../types'

export type HostMsg =
  | { type: 'init'; sessionId: string | null; status: LoopStatus | null; iterations: LoopIteration[]; config: LoopConfig | null }
  | { type: 'status'; status: LoopStatus }
  | { type: 'iteration'; iteration: LoopIteration }
  | { type: 'startResult'; ok: boolean; error?: string }
  | { type: 'restoreResult'; ok: boolean; sha?: string; error?: string }
  | { type: 'aiResult'; ok: boolean; text?: string; error?: string }

export type WebviewMsg =
  | { type: 'ready' }
  | { type: 'start'; config: LoopConfig }
  | { type: 'stop' }
  | { type: 'saveConfig'; config: LoopConfig }
  | { type: 'restoreBest' }
  | { type: 'clearRequest' }
  | { type: 'improveWithAi'; draft: string; evalCommand: string; targetGlobs: string }

const WEBVIEW_MSG_TYPES = new Set<string>(['ready', 'start', 'stop', 'saveConfig', 'restoreBest', 'clearRequest', 'improveWithAi'])

/** Runtime guard for messages arriving from the sandboxed webview (a trust boundary —
 *  the host must not cast `unknown` straight to `WebviewMsg`). Shape of `config` is
 *  validated separately by parseLoopConfig before the engine acts on it. */
export function isWebviewMsg(raw: unknown): raw is WebviewMsg {
  return typeof raw === 'object' && raw !== null && WEBVIEW_MSG_TYPES.has((raw as { type?: unknown }).type as string)
}
