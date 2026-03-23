import { spawn } from 'node:child_process'
import {
  PROVISIONER_PROTOCOL_VERSION,
  type ProvisionerErrorEvent,
  type ProvisionerEvent,
  type ProvisionerProgressEvent,
  type ProvisionerRequest,
  type ProvisionerResultEvent,
} from '../../shared/provisioning-types'

function isProgressEvent<T>(event: ProvisionerEvent<T>): event is ProvisionerProgressEvent {
  return event.event === 'progress'
}

function isErrorEvent<T>(event: ProvisionerEvent<T>): event is ProvisionerErrorEvent {
  return event.event === 'error'
}

function isResultEvent<T>(event: ProvisionerEvent<T>): event is ProvisionerResultEvent<T> {
  return event.event === 'result'
}

export async function runProvisionerRequest<T>(
  command: string,
  args: string[],
  request: ProvisionerRequest,
  onProgress?: (message: string) => void,
  options?: { timeoutMs?: number },
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
      },
    })

    let stdoutBuffer = ''
    let stderrBuffer = ''
    let settled = false
    const timeoutMs = options?.timeoutMs ?? 60_000
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      reject(new Error(`Provisioner timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    const finish = (): void => {
      clearTimeout(timer)
    }

    const maybeResolveOrReject = (event: ProvisionerEvent<T>): void => {
      if (event.protocolVersion !== PROVISIONER_PROTOCOL_VERSION) {
        settled = true
        finish()
        reject(new Error(`Unsupported provisioner protocol version: ${event.protocolVersion}`))
        return
      }

      if (isProgressEvent(event)) {
        onProgress?.(event.message)
        return
      }

      if (isErrorEvent(event)) {
        settled = true
        finish()
        reject(new Error(event.error.message || 'Provisioner returned an error'))
        return
      }

      if (isResultEvent(event)) {
        settled = true
        finish()
        resolve(event.result)
      }
    }

    const flushLines = (): void => {
      let newlineIndex = stdoutBuffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim()
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
        if (line) {
          try {
            maybeResolveOrReject(JSON.parse(line) as ProvisionerEvent<T>)
          } catch (err) {
            settled = true
            finish()
            reject(new Error(`Invalid provisioner JSON output: ${String(err)}`))
            child.kill('SIGTERM')
            return
          }
        }
        newlineIndex = stdoutBuffer.indexOf('\n')
      }
    }

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdoutBuffer += chunk.toString()
      flushLines()
    })

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrBuffer += chunk.toString()
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      finish()
      reject(err)
    })

    child.on('close', (code) => {
      if (settled) return
      finish()
      const trailing = stdoutBuffer.trim()
      if (trailing) {
        try {
          maybeResolveOrReject(JSON.parse(trailing) as ProvisionerEvent<T>)
          return
        } catch {
          // Fall through to command failure below.
        }
      }
      const stderrText = stderrBuffer.trim()
      reject(new Error(stderrText || `Provisioner exited with code ${code ?? 'unknown'}`))
    })

    child.stdin.write(JSON.stringify(request))
    child.stdin.end()
  })
}
