import type { AgentSession } from '../../shared/types'
import type { SimpleRuntimeOutputMode } from '../agent/simple-runtime'

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
}
