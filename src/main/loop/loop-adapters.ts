import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { BrowserWindow } from 'electron'
import type { SessionManager } from '../session/session-manager'
import type { GitOperations } from '../git/git-operations'
import { getRuntimeById } from '../agent/runtimes'
import type {
  LoopSessionAdapter,
  LoopGitAdapter,
  LoopEvalRunner,
  LoopJudgeAdapter,
  LoopEmitter,
  LoopIterationLog,
  EvalOutcome,
  WaitForTurnEnd,
} from './loop-runner'
import { appendIteration, readAllIterations } from './loop-iteration-log'
import type { LoopConfig, LoopStatus } from '../../shared/loop-types'

const execFileAsync = promisify(execFile)

export function createSessionAdapter(sessionManager: SessionManager): LoopSessionAdapter {
  return {
    getWorktreePath(sessionId: string): string | null {
      return sessionManager.getSession(sessionId)?.worktreePath ?? null
    },
    sendInput(sessionId: string, text: string): void {
      sessionManager.sendInput(sessionId, text)
    },
    getStatus(sessionId: string): string | null {
      return sessionManager.getInternalSession(sessionId)?.status ?? null
    },
    setLoopConfig(sessionId: string, config: LoopConfig): void {
      const internal = sessionManager.getInternalSession(sessionId)
      if (internal) internal.loopConfig = config
    },
    getLoopConfig(sessionId: string): LoopConfig | null {
      return sessionManager.getInternalSession(sessionId)?.loopConfig ?? null
    },
    setLoopStatus(sessionId: string, status: LoopStatus): void {
      const internal = sessionManager.getInternalSession(sessionId)
      if (internal) internal.loopStatus = status
    },
    getLoopStatus(sessionId: string): LoopStatus | null {
      return sessionManager.getInternalSession(sessionId)?.loopStatus ?? null
    },
  }
}

export function createGitAdapter(): LoopGitAdapter {
  return {
    async getHeadSha(worktreePath: string): Promise<string> {
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: worktreePath })
      return stdout.trim()
    },
    async stageAllAndCommit(worktreePath: string, message: string): Promise<string> {
      await execFileAsync('git', ['add', '-A'], { cwd: worktreePath })
      await execFileAsync('git', ['commit', '-m', message, '--no-verify'], { cwd: worktreePath })
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: worktreePath })
      return stdout.trim()
    },
    async hardReset(worktreePath: string, sha: string): Promise<void> {
      await execFileAsync('git', ['reset', '--hard', sha], { cwd: worktreePath })
      await execFileAsync('git', ['clean', '-fd'], { cwd: worktreePath })
    },
    async getChangedFilesCount(worktreePath: string): Promise<number> {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: worktreePath })
      return stdout.split('\n').filter((line) => line.trim().length > 0).length
    },
    async getDiff(worktreePath: string, sinceSha: string): Promise<string> {
      const { stdout } = await execFileAsync(
        'git',
        ['diff', sinceSha, '--', '.'],
        { cwd: worktreePath, maxBuffer: 16 * 1024 * 1024 },
      )
      return stdout
    },
  }
}

export function createEvalRunner(): LoopEvalRunner {
  return {
    async run(worktreePath: string, command: string, budgetSeconds: number, signal: AbortSignal): Promise<EvalOutcome> {
      return new Promise<EvalOutcome>((resolve, reject) => {
        const child = spawn(command, {
          cwd: worktreePath,
          shell: true,
          env: process.env,
        })
        let stdout = ''
        let stderr = ''
        let timedOut = false
        let settled = false

        const timer = setTimeout(() => {
          timedOut = true
          try { child.kill('SIGTERM') } catch { /* already exited */ }
          setTimeout(() => { try { child.kill('SIGKILL') } catch { /* ok */ } }, 2000)
        }, budgetSeconds * 1000)

        const onAbort = (): void => {
          try { child.kill('SIGTERM') } catch { /* ok */ }
        }
        signal.addEventListener('abort', onAbort, { once: true })

        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })

        child.on('error', (err: Error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal.removeEventListener('abort', onAbort)
          reject(err)
        })
        child.on('close', (code: number | null) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal.removeEventListener('abort', onAbort)
          resolve({
            stdout: stdout + (stderr ? `\n---stderr---\n${stderr}` : ''),
            exitCode: code ?? (timedOut ? 124 : 1),
            timedOut,
          })
        })
      })
    },
  }
}

export function createEmitter(getWindow: () => BrowserWindow | null): LoopEmitter {
  return {
    emit(channel: string, payload: unknown): void {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, payload)
      }
    },
  }
}

const DIFF_CHAR_LIMIT = 24_000
const STDOUT_CHAR_LIMIT = 8_000
const JUDGE_TIMEOUT_MS = 120_000

export function createJudgeAdapter(sessionManager: SessionManager, gitOps: GitOperations): LoopJudgeAdapter {
  return {
    async judge(request, signal) {
      if (signal.aborted) return { failure: 'aborted before judge ran' }
      const session = sessionManager.getSession(request.sessionId)
      if (!session) return { failure: `session not found: ${request.sessionId}` }
      const runtime = getRuntimeById(session.runtimeId)
      if (!runtime) return { failure: `runtime not found: ${session.runtimeId}` }

      const rubric = request.rubric.trim() || 'Rate overall quality of the change.'
      const prompt = buildJudgePrompt({
        rubric,
        maxScore: request.maxScore,
        evalStdout: request.evalStdout,
        diff: request.diff,
        iterationIndex: request.iterationIndex,
        previousBestScore: request.previousBestScore,
      })

      let output: string
      try {
        output = await gitOps.aiGenerate(
          runtime,
          prompt,
          session.worktreePath,
          runtime.aiModelArgs ?? [],
          { silent: true, timeoutMs: JUDGE_TIMEOUT_MS },
        )
      } catch (err) {
        return { failure: `judge runtime failed: ${(err as Error).message}` }
      }

      const score = extractScore(output, request.maxScore)
      if (score === null) {
        return { failure: `judge did not return a numeric score (got: ${truncate(output, 240)})`, rawOutput: output }
      }
      return { score, rawOutput: output }
    },
  }
}

interface JudgePromptInput {
  rubric: string
  maxScore: number
  evalStdout: string
  diff: string
  iterationIndex: number
  previousBestScore?: number
}

function buildJudgePrompt(input: JudgePromptInput): string {
  const { rubric, maxScore, evalStdout, diff, iterationIndex, previousBestScore } = input
  const stdoutExcerpt = truncate(evalStdout, STDOUT_CHAR_LIMIT)
  const diffExcerpt = truncate(diff, DIFF_CHAR_LIMIT)
  const low = Math.max(1, Math.round(maxScore * 0.2))
  const mid = Math.round(maxScore * 0.5)
  const high = Math.round(maxScore * 0.8)

  const anchorBlock = [
    `Calibration anchors (use the FULL scale — do not default to 0, 1, or ${maxScore}):`,
    `  0           = change is broken, harmful, or does nothing relevant`,
    `  ${low.toString().padEnd(11)} = weak / questionable improvement`,
    `  ${mid.toString().padEnd(11)} = neutral — meets baseline expectations, no net harm or help`,
    `  ${high.toString().padEnd(11)} = solid improvement across most rubric criteria`,
    `  ${maxScore.toString().padEnd(11)} = reserved for exceptional, clearly-complete work`,
  ]

  const anchorContext = previousBestScore === undefined
    ? [
      `This is iteration #${iterationIndex} — the first candidate. No previous baseline score exists.`,
      `Score this cumulative diff against the rubric using the calibration anchors below.`,
    ]
    : [
      `This is iteration #${iterationIndex}. The previous best candidate (a SUBSET of the diff below)`,
      `scored ${previousBestScore}/${maxScore}. The diff you are evaluating now contains ALL of that`,
      `work PLUS additional changes from this iteration.`,
      `Your score MUST reflect the comparison:`,
      `  - If this iteration adds real, useful progress, score > ${previousBestScore}.`,
      `  - If this iteration is neutral or cosmetic-only, score = ${previousBestScore}.`,
      `  - If it introduces regressions, redundancy, or noise, score < ${previousBestScore}.`,
      `Do NOT anchor stubbornly on the prior score — differentiate.`,
    ]

  return [
    `You are judging a cumulative code change on a 0–${maxScore} integer scale.`,
    '',
    ...anchorContext,
    '',
    ...anchorBlock,
    '',
    `Rubric to apply:`,
    rubric,
    '',
    `Eval command output (truncated):`,
    '```',
    stdoutExcerpt || '(no output)',
    '```',
    '',
    `Cumulative diff from loop baseline (truncated):`,
    '```diff',
    diffExcerpt || '(no diff)',
    '```',
    '',
    `Instructions:`,
    `1. For each rubric criterion, write ONE short line naming the criterion and awarding a sub-score (e.g. "criterion X: 3/${maxScore}, because ..."). Be specific about the diff.`,
    `2. Combine the sub-scores into a final integer in [0, ${maxScore}], positioned relative to the prior best if given.`,
    `3. On the very last line, output EXACTLY this format and nothing else:`,
    `   FINAL_SCORE: <integer between 0 and ${maxScore}>`,
    `The last line is parsed mechanically — any deviation will be treated as a judge failure.`,
  ].join('\n')
}

function extractScore(output: string, maxScore: number): number | null {
  const tagged = output.match(/FINAL[_\s-]?SCORE\s*[:=]\s*(-?\d+(?:\.\d+)?)/i)
  const raw = tagged?.[1] ?? lastNumber(output)
  if (raw === null) return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  if (value < 0) return 0
  if (value > maxScore) return maxScore
  return value
}

function lastNumber(output: string): string | null {
  const matches = output.match(/-?\d+(?:\.\d+)?/g)
  if (!matches || matches.length === 0) return null
  return matches[matches.length - 1]
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + `\n…[truncated ${text.length - max} chars]`
}

export function createIterationLog(): LoopIterationLog {
  return {
    append: appendIteration,
    readAll: readAllIterations,
  }
}

/**
 * Wait for an agent session's turn to end after we sent a new prompt.
 *
 * A turn is "ended" only when BOTH hold:
 *   1. status has been idle ('done' | 'waiting') for IDLE_GRACE_MS
 *   2. no PTY output has been received for IDLE_GRACE_MS
 *
 * Status alone is unreliable: Claude-style agents flap in and out of idle
 * between tool calls, and the initial idle window (before the prompt is
 * processed) can be mistaken for turn completion. Requiring output silence
 * of several seconds catches agents that are still mid-turn but between
 * observable status transitions.
 *
 * We also require the session to have produced OUTPUT after turnStart before
 * we'll consider it ended — proves the prompt was received and acted on.
 */
const IDLE_GRACE_MS = 4000

export function createWaitForTurnEnd(sessionManager: SessionManager): WaitForTurnEnd {
  return async (sessionId, budgetSeconds, signal) => {
    const turnStart = Date.now()
    const deadline = turnStart + budgetSeconds * 1000
    const pollMs = 500
    const idleStates = new Set(['done', 'waiting'])

    let idleSince: number | null = null
    let sawPostPromptOutput = false

    while (Date.now() < deadline) {
      if (signal.aborted) return 'aborted'
      const internal = sessionManager.getInternalSession(sessionId)
      const status = internal?.status ?? 'done'
      const lastOutput = internal?.lastOutputTime ?? 0
      if (lastOutput > turnStart) sawPostPromptOutput = true

      const isIdle = idleStates.has(status)
      if (!isIdle) {
        idleSince = null
      } else if (idleSince === null) {
        idleSince = Date.now()
      }

      const now = Date.now()
      const silenceMs = now - Math.max(lastOutput, turnStart)
      const idleMs = idleSince === null ? 0 : now - idleSince
      if (sawPostPromptOutput && isIdle && idleMs >= IDLE_GRACE_MS && silenceMs >= IDLE_GRACE_MS) {
        return 'ended'
      }

      await sleep(pollMs)
    }
    return 'timeout'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
