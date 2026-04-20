export type MetricDirection = 'minimize' | 'maximize'

export type MetricSpec =
  | { kind: 'stdout-regex'; pattern: string; direction: MetricDirection }
  | { kind: 'json-path'; path: string; direction: MetricDirection }
  | { kind: 'exit-code'; direction: 'minimize' }
  | { kind: 'llm-judge'; rubric: string; maxScore: number; direction: 'maximize' }

export interface LoopConfig {
  sessionId: string
  program: string
  targetGlobs: string[]
  evalCommand: string
  metric: MetricSpec
  budgetSeconds: number
  maxIterations?: number
  maxWallClockMinutes?: number
}

export type IterationOutcome = 'improved' | 'regressed' | 'failed' | 'aborted'

export interface LoopIteration {
  index: number
  startedAt: number
  finishedAt?: number
  score?: number
  outcome: IterationOutcome
  commitSha?: string
  evalStdoutTail?: string
  judgeOutputTail?: string
  agentSummary?: string
  errorMessage?: string
}

export type LoopRunState = 'idle' | 'running' | 'paused' | 'finished' | 'error'

export interface LoopStatus {
  sessionId: string
  state: LoopRunState
  currentIteration: number
  bestScore?: number
  bestCommitSha?: string
  startedAt?: number
  stoppedAt?: number
  errorMessage?: string
}
