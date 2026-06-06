// resources/plugins/manifold.loop/src/webview/loop-state.ts
import type { LoopConfig, LoopIteration, LoopStatus } from '../types'
import type { HostMsg } from './protocol'

export interface UiLoopState {
  sessionId: string | null
  status: LoopStatus | null
  iterations: LoopIteration[]
  config: LoopConfig | null
  /** Last start failure (e.g. no active session), shown until the next start attempt. */
  startError: string | null
}

export const EMPTY_LOOP_STATE: UiLoopState = { sessionId: null, status: null, iterations: [], config: null, startError: null }

/** Pure reducer for host→webview state messages. The promise-result messages (aiResult,
 *  restoreResult) are handled by the bridge's single-flight plumbing, not here. */
export function applyHostMsg(state: UiLoopState, msg: HostMsg): UiLoopState {
  switch (msg.type) {
    case 'init':
      return { sessionId: msg.sessionId, status: msg.status, iterations: msg.iterations, config: msg.config, startError: null }
    case 'status':
      return { ...state, status: msg.status }
    case 'iteration':
      return { ...state, iterations: [...state.iterations, msg.iteration] }
    case 'startResult':
      // start() failed before the engine could publish a status — revert the optimistic
      // "running" state the bridge set on click and surface why.
      return msg.ok ? { ...state, startError: null } : { ...state, status: null, startError: msg.error ?? 'failed to start loop' }
    default:
      return state
  }
}
