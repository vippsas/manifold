/** Shared fallback for `maxIterations` — used by the config form and the engine so a
 *  config that omits the field behaves the same everywhere. */
export const DEFAULT_MAX_ITERATIONS = 20

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
  alwaysAdvance?: boolean
  clearContextEachIteration?: boolean
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

function isMetricSpec(m: unknown): m is MetricSpec {
  if (typeof m !== 'object' || m === null) return false
  const k = (m as { kind?: unknown }).kind
  if (k === 'exit-code') return true
  if (k === 'stdout-regex') return typeof (m as { pattern?: unknown }).pattern === 'string'
  if (k === 'json-path') return typeof (m as { path?: unknown }).path === 'string'
  if (k === 'llm-judge') {
    const ms = (m as { maxScore?: unknown }).maxScore
    return typeof (m as { rubric?: unknown }).rubric === 'string' && typeof ms === 'number' && Number.isFinite(ms) && ms > 0
  }
  return false
}

/** Validate an untrusted/persisted value into a LoopConfig. The config form is one entry
 *  point, but the engine, the `manifold.loop.start` command, the webview message boundary,
 *  and storage reads all funnel through here so the invariants travel with the type rather
 *  than living only in the UI. Returns the config or a human-readable `{ error }`. */
export function parseLoopConfig(raw: unknown): LoopConfig | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: 'config must be an object' }
  const c = raw as Record<string, unknown>
  if (typeof c.sessionId !== 'string' || !c.sessionId) return { error: 'config.sessionId is required' }
  if (typeof c.program !== 'string' || !c.program.trim()) return { error: 'program cannot be empty — describe the task' }
  if (!Array.isArray(c.targetGlobs) || !c.targetGlobs.every((g) => typeof g === 'string')) return { error: 'targetGlobs must be an array of strings' }
  if (typeof c.evalCommand !== 'string') return { error: 'evalCommand must be a string' }
  if (!isMetricSpec(c.metric)) return { error: 'metric is invalid' }
  if (typeof c.budgetSeconds !== 'number' || !Number.isFinite(c.budgetSeconds) || c.budgetSeconds <= 0) return { error: 'budgetSeconds must be positive' }
  if (c.maxIterations !== undefined && (typeof c.maxIterations !== 'number' || !Number.isFinite(c.maxIterations) || c.maxIterations <= 0)) return { error: 'maxIterations must be positive' }
  if (c.metric.kind !== 'llm-judge' && !c.evalCommand.trim()) return { error: 'evalCommand cannot be empty' }
  return raw as LoopConfig
}

export type LoopRunState = 'idle' | 'running' | 'paused' | 'finished' | 'error'

export interface LoopStatus {
  sessionId: string
  state: LoopRunState
  currentIteration: number
  bestScore?: number
  bestCommitSha?: string
  baselineSha?: string
  startedAt?: number
  stoppedAt?: number
  errorMessage?: string
}
