import type { MemoryObservation } from '../../shared/memory-types'

export interface CompressionResult {
  summary: {
    taskDescription: string
    whatWasDone: string
    whatWasLearned: string
    decisionsMade: string[]
    filesChanged: string[]
  }
  observations: Array<{
    type: MemoryObservation['type']
    title: string
    summary: string
    narrative?: string
    facts: string[]
    concepts?: string[]
    filesTouched: string[]
  }>
}

export interface RegexFallbackContext {
  runtimeId?: string
  branchName?: string
  taskDescription?: string
}
