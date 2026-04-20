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
  }
}

/**
 * Wait for an agent session's status to transition to 'done' (idle) after we
 * sent a new prompt. We look for: a non-'done'/'waiting' observed state (the
 * turn has started), followed by a return to 'done'/'waiting'.
 */
export function createWaitForTurnEnd(sessionManager: SessionManager): WaitForTurnEnd {
  return async (sessionId, budgetSeconds, signal) => {
    const deadline = Date.now() + budgetSeconds * 1000
    const pollMs = 500
    const idleStates = new Set(['done', 'waiting'])
    let sawActivity = false
    const initial = sessionManager.getInternalSession(sessionId)?.status ?? 'done'
    if (!idleStates.has(initial)) sawActivity = true

    while (Date.now() < deadline) {
      if (signal.aborted) return 'aborted'
      const status = sessionManager.getInternalSession(sessionId)?.status ?? 'done'
      if (!idleStates.has(status)) {
        sawActivity = true
      } else if (sawActivity) {
        // Give a short grace period in case status flutters
        await sleep(pollMs)
        if (signal.aborted) return 'aborted'
        const confirm = sessionManager.getInternalSession(sessionId)?.status ?? 'done'
        if (idleStates.has(confirm)) return 'ended'
      }
      await sleep(pollMs)
    }
    return 'timeout'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
