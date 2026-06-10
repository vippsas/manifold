import { spawn } from 'node:child_process'

export interface GitExecOptions {
  /**
   * Maximum time in milliseconds before the child is killed. Use for
   * network-touching commands (fetch, clone) that can hang indefinitely —
   * e.g. git prompting on /dev/tty when launched from a terminal.
   */
  timeoutMs?: number
}

/**
 * Runs a git command in the given directory, returning stdout as a string.
 * Uses explicit stdio to avoid Electron EBADF issues when spawned from
 * a non-TTY context.
 */
export function gitExec(args: string[], cwd: string, options: GitExecOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []

    let timedOut = false
    let timer: NodeJS.Timeout | undefined
    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, options.timeoutMs)
      timer.unref?.()
    }

    child.stdout!.on('data', (data: Buffer) => chunks.push(data))
    child.stderr!.on('data', (data: Buffer) => errChunks.push(data))

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`git ${args[0]} timed out after ${options.timeoutMs}ms`))
      } else if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString('utf8')
        reject(new Error(`git ${args[0]} failed (code ${code}): ${stderr}`))
      } else {
        resolve(Buffer.concat(chunks).toString('utf8'))
      }
    })
  })
}
