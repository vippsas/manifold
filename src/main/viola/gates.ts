import { spawn } from 'node:child_process'

export interface ViolaGateResult {
  ok: boolean
  /** Combined stdout+stderr tail, bounded so it fits in a fix prompt. */
  output: string
}

export interface ViolaGates {
  run(worktreePath: string, command: string, signal: AbortSignal): Promise<ViolaGateResult>
}

const GATE_TIMEOUT_MS = 15 * 60_000
const OUTPUT_TAIL_CHARS = 4_000

/** Runs a plan-approved shell command from the worker's worktree root and reports exit 0 as green. */
export function createViolaGates(): ViolaGates {
  return {
    run(worktreePath, command, signal) {
      return new Promise((resolve) => {
        const child = spawn(command, { cwd: worktreePath, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
        let output = ''
        let settled = false
        const collect = (chunk: Buffer): void => {
          output = (output + chunk.toString()).slice(-OUTPUT_TAIL_CHARS * 2)
        }
        const finish = (ok: boolean, text: string): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal.removeEventListener('abort', onAbort)
          resolve({ ok, output: text.slice(-OUTPUT_TAIL_CHARS) })
        }
        const onAbort = (): void => {
          child.kill('SIGTERM')
          finish(false, `${output}\n[gate aborted by Viola]`)
        }
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          finish(false, `${output}\n[gate timed out after ${GATE_TIMEOUT_MS / 60_000} minutes]`)
        }, GATE_TIMEOUT_MS)
        timer.unref?.()
        signal.addEventListener('abort', onAbort, { once: true })
        child.stdout.on('data', collect)
        child.stderr.on('data', collect)
        child.on('error', (error) => finish(false, `${output}\n${error.message}`))
        child.on('close', (code) => finish(code === 0, output))
      })
    },
  }
}
