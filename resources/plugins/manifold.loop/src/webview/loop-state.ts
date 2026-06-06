// resources/plugins/manifold.loop/src/webview/loop-state.ts
import type { LoopConfig, LoopIteration, LoopStatus } from '../types'
import type { HostMsg } from './protocol'

export interface UiLoopState {
  sessionId: string | null
  status: LoopStatus | null
  iterations: LoopIteration[]
  config: LoopConfig | null
}

export const EMPTY_LOOP_STATE: UiLoopState = { sessionId: null, status: null, iterations: [], config: null }

/** Pure reducer for host→webview state messages. Result-only messages (aiResult,
 *  restoreResult, actionError) are handled by the bridge's promise plumbing, not here. */
export function applyHostMsg(state: UiLoopState, msg: HostMsg): UiLoopState {
  switch (msg.type) {
    case 'init':
      return { sessionId: msg.sessionId, status: msg.status, iterations: msg.iterations, config: msg.config }
    case 'status':
      return { ...state, status: msg.status }
    case 'iteration':
      return { ...state, iterations: [...state.iterations, msg.iteration] }
    default:
      return state
  }
}
