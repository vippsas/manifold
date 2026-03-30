import type { AgentSession } from '../../shared/types'
import type { SimpleRuntimeOutputMode } from '../agent/simple-runtime'

export interface ShellSuggestionState {
  /** The currently displayed suggestion text, or null if none */
  activeSuggestion: string | null
  /** Whether a prediction request is in flight */
  pending: boolean
}

export interface InternalSession extends AgentSession {
  ptyId: string
  outputBuffer: string
  taskDescription?: string
  ollamaModel?: string
  detectedUrl?: string
  detectedVercelUrl?: string
  nonInteractive?: boolean
  devServerPtyId?: string
  /** Buffer for accumulating partial NDJSON lines from stream-json output */
  streamJsonLineBuffer?: string
  nonInteractiveOutputMode?: SimpleRuntimeOutputMode
  /** Temp ZDOTDIR created for Manifold shell prompt — cleaned up on session exit */
  zdotdir?: string
  /** AI shell command suggestion state (shell sessions only) */
  shellSuggestion?: ShellSuggestionState
}
