export type VerdictOutcome =
  | 'merged'
  | 'pr_created'
  | 'committed_only'
  | 'discarded'
  | 'unknown'

export type TaskPrompt =
  | { kind: 'full'; text: string }
  | {
      kind: 'truncated'
      head: string
      middleSummary: string
      tail: string
      originalLength: number
    }

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface VerdictMetrics {
  agentCommits: number
  humanEdits: number
  diffLines: { added: number; removed: number }
  filesChanged: number
  prUrl?: string
  /** Token usage for the session; absent when the runtime exposes none (n/a). */
  tokenUsage?: TokenUsage
  /** Human prompt→response cycles in the session; absent when unknown (n/a). */
  turns?: number
}

export interface VerdictRecord {
  sessionId: string
  projectId: string
  branch: string
  runtime: string
  taskPrompt: TaskPrompt
  outcome: VerdictOutcome
  createdAt: string
  terminatedAt?: string
  durationMs?: number
  metrics: VerdictMetrics
}
