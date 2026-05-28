import type {
  LoopConfig,
  LoopIteration,
  LoopStatus,
} from '../../shared/loop-types'

export interface LoopSessionAdapter {
  getWorktreePath(sessionId: string): string | null
  sendInput(sessionId: string, text: string): void
  getStatus(sessionId: string): string | null
  setLoopConfig(sessionId: string, config: LoopConfig): void
  getLoopConfig(sessionId: string): LoopConfig | null
  setLoopStatus(sessionId: string, status: LoopStatus): void
  getLoopStatus(sessionId: string): LoopStatus | null
}

export interface LoopGitAdapter {
  getHeadSha(worktreePath: string): Promise<string>
  stageAllAndCommit(worktreePath: string, message: string): Promise<string>
  hardReset(worktreePath: string, sha: string): Promise<void>
  getChangedFilesCount(worktreePath: string): Promise<number>
  getDiff(worktreePath: string, sinceSha: string): Promise<string>
}

export interface JudgeRequest {
  sessionId: string
  rubric: string
  maxScore: number
  evalStdout: string
  diff: string
  hasEvalCommand: boolean
  program: string
}

export interface JudgeResult {
  score?: number
  failure?: string
  rawOutput?: string
}

export interface LoopJudgeAdapter {
  judge(request: JudgeRequest, signal: AbortSignal): Promise<JudgeResult>
}

export interface EvalOutcome {
  stdout: string
  exitCode: number
  timedOut: boolean
}

export interface LoopEvalRunner {
  run(worktreePath: string, command: string, budgetSeconds: number, signal: AbortSignal): Promise<EvalOutcome>
}

export interface LoopEmitter {
  emit(channel: string, payload: unknown): void
}

export interface LoopIterationLog {
  append(worktreePath: string, iter: LoopIteration): Promise<void>
  readAll(worktreePath: string): Promise<LoopIteration[]>
  clear(worktreePath: string): Promise<void>
}

export type WaitForTurnEnd = (sessionId: string, budgetSeconds: number, signal: AbortSignal) => Promise<'ended' | 'timeout' | 'aborted'>

export interface LoopRunnerDeps {
  session: LoopSessionAdapter
  git: LoopGitAdapter
  evalRunner: LoopEvalRunner
  judge: LoopJudgeAdapter
  emitter: LoopEmitter
  iterationLog: LoopIterationLog
  waitForTurnEnd: WaitForTurnEnd
  now?: () => number
}
