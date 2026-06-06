// resources/plugins/manifold.loop/src/webview/protocol.ts
// Typed messages between the loop webview and the plugin host. Shared by both sides
// (type-only on the webview side; bundling drops it). B2a exercises `ready` → `init` and
// live `status`/`iteration`; the action variants are wired in B2b.
import type { LoopConfig, LoopIteration, LoopStatus } from '../types'

export type HostMsg =
  | { type: 'init'; sessionId: string | null; status: LoopStatus | null; iterations: LoopIteration[]; config: LoopConfig | null }
  | { type: 'status'; status: LoopStatus }
  | { type: 'iteration'; iteration: LoopIteration }
  | { type: 'restoreResult'; ok: boolean; sha?: string; error?: string }
  | { type: 'aiResult'; ok: boolean; text?: string; error?: string }
  | { type: 'actionError'; message: string }

export type WebviewMsg =
  | { type: 'ready' }
  | { type: 'start'; config: LoopConfig }
  | { type: 'stop' }
  | { type: 'saveConfig'; config: LoopConfig }
  | { type: 'restoreBest' }
  | { type: 'clearRequest' }
  | { type: 'improveWithAi'; draft: string; evalCommand: string; targetGlobs: string }
