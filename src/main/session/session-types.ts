import type { AgentSession } from '../../shared/types'
import type { LoopConfig, LoopStatus } from '../../shared/loop-types'
import type { SimpleRuntimeOutputMode } from '../agent/simple-runtime'
import type { NlInputBuffer, RollingOutputBuffer } from './nl-command-translator'

export interface ShellSuggestionState {
  /** The currently displayed suggestion text, or null if none */
  activeSuggestion: string | null
  /** Whether a prediction request is in flight */
  pending: boolean
  /** Whether ghost text is currently drawn in the terminal */
  ghostVisible?: boolean
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
  /** Slash command/skill names from the Claude system/init event, for the chat `/` autocomplete */
  slashCommands?: string[]
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
  /** Autoresearch loop configuration for this session, if any */
  loopConfig?: LoopConfig
  /** Latest loop run status; kept even after the runner completes so the UI can show history */
  loopStatus?: LoopStatus
}
