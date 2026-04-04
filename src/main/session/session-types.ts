import type { AgentSession } from '../../shared/types'
import type { SimpleRuntimeOutputMode } from '../agent/simple-runtime'
import type { NlInputBuffer, RollingOutputBuffer } from './nl-command-translator'

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
  simpleTemplateTitle?: string
  simplePromptInstructions?: string
  ollamaModel?: string
  detectedUrl?: string
  detectedVercelUrl?: string
  /** Timestamp of most recent PTY output — used for activity-state tracking */
  lastOutputTime?: number
  nonInteractive?: boolean
  devServerPtyId?: string
  /** Buffer for accumulating partial NDJSON lines from stream-json output */
  streamJsonLineBuffer?: string
  nonInteractiveOutputMode?: SimpleRuntimeOutputMode
  /** Temp ZDOTDIR created for Manifold shell prompt — cleaned up on session exit */
  zdotdir?: string
  /** AI shell command suggestion state (shell sessions only) */
  shellSuggestion?: ShellSuggestionState
  /** NL command translator state (shell sessions only) */
  nlInputBuffer?: NlInputBuffer
  /** Rolling buffer of recent plain-text terminal output for NL context */
  nlOutputBuffer?: RollingOutputBuffer
  /** Whether an NL translation request is in flight */
  nlPending?: boolean
  /** Whether the first-prompt NL hint ghost text has been shown */
  nlHintShown?: boolean
  /** Whether the NL hint ghost text is currently visible (cleared on keystroke) */
  nlHintActive?: boolean
}
