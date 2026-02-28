import type { AgentSession } from '../../shared/types'

export interface InternalSession extends AgentSession {
  ptyId: string
  outputBuffer: string
  taskDescription?: string
  ollamaModel?: string
  detectedUrl?: string
  nonInteractive?: boolean
  devServerPtyId?: string
  /** Buffer for accumulating partial NDJSON lines from stream-json output */
  streamJsonLineBuffer?: string
}
