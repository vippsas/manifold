export const VIOLA_WORKER_IDS = ['claude', 'codex', 'copilot', 'gemini'] as const
export type ViolaWorkerId = typeof VIOLA_WORKER_IDS[number]

export type ViolaTaskState =
  | 'planned'
  | 'spawning'
  | 'implementing'
  | 'reviewing'
  | 'fixing'
  | 'done'
  | 'needs_attention'
  | 'error'

export interface ViolaTaskPlan {
  id: string
  title: string
  description: string
  acceptance: string[]
}

export interface ViolaPlan {
  summary: string
  tasks: ViolaTaskPlan[]
}

export interface ViolaReview {
  passed: boolean
  blocking: string[]
  nonBlocking: string[]
}

export interface ViolaTaskRun extends ViolaTaskPlan {
  state: ViolaTaskState
  runtimeId?: ViolaWorkerId
  reviewRuntimeId?: ViolaWorkerId
  sessionId?: string
  worktreePath?: string
  review?: ViolaReview
  prUrl?: string
  error?: string
}

export type ViolaRunState =
  | 'planned'
  | 'running'
  | 'complete'
  | 'needs_attention'
  | 'stopped'
  | 'error'

export interface ViolaRun {
  id: string
  baseSessionId: string
  goal: string
  summary: string
  state: ViolaRunState
  availableRuntimes: ViolaWorkerId[]
  tasks: ViolaTaskRun[]
  createdAt: number
  error?: string
}

export function isViolaWorker(value: string): value is ViolaWorkerId {
  return (VIOLA_WORKER_IDS as readonly string[]).includes(value)
}
