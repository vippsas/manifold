import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { BrowserWindow } from 'electron'
import type { SessionManager } from '../session/session-manager'
import type {
  LoopSessionAdapter,
  LoopGitAdapter,
  LoopEvalRunner,
  LoopEmitter,
  LoopIterationLog,
  EvalOutcome,
  WaitForTurnEnd,
} from './loop-runner'
import { appendIteration, readAllIterations, clearIterations } from './loop-iteration-log'
import type { LoopConfig, LoopStatus } from '../../shared/loop-types'

export { createJudgeAdapter } from './loop-judge-adapter'

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

export function createIterationLog(): LoopIterationLog {
  return {
    append: appendIteration,
    readAll: readAllIterations,
    clear: clearIterations,
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
