// resources/plugins/manifold.loop/src/eval-runner.ts
// Runs the loop's eval command in the worktree. Pure Node — no manifold import.
import { spawn } from 'node:child_process'

export interface EvalOutcome { stdout: string; exitCode: number; timedOut: boolean }

export interface LoopEvalRunner {
  run(worktreePath: string, command: string, budgetSeconds: number, signal: AbortSignal): Promise<EvalOutcome>
}

export function createEvalRunner(): LoopEvalRunner {
  return {
    async run(worktreePath, command, budgetSeconds, signal) {
      return new Promise<EvalOutcome>((resolve, reject) => {
        const child = spawn(command, {
          cwd: worktreePath,
          shell: true,
          env: process.env,
          detached: process.platform !== 'win32',
        })
        let stdout = ''
        let stderr = ''
        let timedOut = false
        let settled = false
        let killTimer: ReturnType<typeof setTimeout> | undefined

        const timer = setTimeout(() => {
          timedOut = true
          killChild('SIGTERM')
          killTimer = setTimeout(() => killChild('SIGKILL'), 2000)
        }, budgetSeconds * 1000)

        const killChild = (signal: NodeJS.Signals): void => {
          try {
            if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal)
            else child.kill(signal)
          } catch { /* already exited */ }
        }

        // Clear both the budget timer and the (possibly-pending) SIGKILL fallback so a
        // child that exits promptly after SIGTERM doesn't leave a timer holding the event loop.
        const clearTimers = (): void => { clearTimeout(timer); if (killTimer) clearTimeout(killTimer) }

        const onAbort = (): void => {
          killChild('SIGTERM')
          killTimer = setTimeout(() => killChild('SIGKILL'), 2000)
        }
        signal.addEventListener('abort', onAbort, { once: true })

        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })

        child.on('error', (err: Error) => {
          if (settled) return
          settled = true
          clearTimers()
          signal.removeEventListener('abort', onAbort)
          reject(err)
        })
        child.on('close', (code: number | null) => {
          if (settled) return
          settled = true
          clearTimers()
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
