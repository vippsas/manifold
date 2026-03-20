import { spawn } from 'node:child_process'
import { debugLog } from '../app/debug-log'

const DEFAULT_TIMEOUT_MS = 30_000

interface AiPromptOptions {
  binary: string
  args: string[]
  prompt: string
  cwd: string
  timeoutMs?: number
}

export function runAiPrompt({
  binary,
  args,
  prompt,
  cwd,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: AiPromptOptions): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const chunks: Buffer[] = []
    child.stdout.on('data', (data: Buffer) => chunks.push(data))
    child.stderr.resume() // drain stderr to prevent back-pressure stall

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, timeoutMs)

    child.on('error', (err) => {
      clearTimeout(timer)
      debugLog(`[runAiPrompt] spawn failed: ${err.message}`)
      resolve('')
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      const result = Buffer.concat(chunks).toString('utf8').trim()
      if (code === 0 && result) {
        resolve(result)
      } else {
        debugLog(`[runAiPrompt] failed: exit code ${code}`)
        resolve('')
      }
    })

    child.stdin.write(prompt)
    child.stdin.end()
  })
}
