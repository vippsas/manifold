export const VIOLA_WORKER_IDS = ['claude', 'codex', 'copilot', 'gemini'] as const
export type ViolaWorkerId = typeof VIOLA_WORKER_IDS[number]

export const VIOLA_TASK_PURPOSES = ['implement', 'explore'] as const
export type ViolaTaskPurpose = typeof VIOLA_TASK_PURPOSES[number]

export type ViolaTaskState =
  | 'planned'
  | 'spawning'
  | 'implementing'
  | 'exploring'
  | 'gating'
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
  /** `implement` changes the repo and is gated + cross-reviewed; `explore` is read-only and returns a report. */
  purpose: ViolaTaskPurpose
  /** The planner's suggested worker; honored only when installed. */
  worker?: ViolaWorkerId
  /** Shell commands Viola runs in the worker's worktree before review. Red output goes back to the worker once. */
  gates: string[]
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
  /** When the task entered `state`, so a live view can show how long the step has run. */
  stateSince: number
  runtimeId?: ViolaWorkerId
  reviewRuntimeId?: ViolaWorkerId
  sessionId?: string
  /** The reviewer's own session, so its terminal can be opened while it reviews. */
  reviewSessionId?: string
  worktreePath?: string
  /** The worker's own final message: an explore answer or an implementer's unverified summary. */
  report?: string
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

export function isViolaTaskPurpose(value: string): value is ViolaTaskPurpose {
  return (VIOLA_TASK_PURPOSES as readonly string[]).includes(value)
}
