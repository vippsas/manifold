import { spawn } from 'node:child_process'
import {
  PROVISIONER_PROTOCOL_VERSION,
  type ProvisionerErrorEvent,
  type ProvisionerEvent,
  type ProvisionerProgressEvent,
  type ProvisionerRequest,
  type ProvisionerResultEvent,
  type ProvisioningProgressPayload,
} from '../../shared/provisioning-types'
import { fromProvisionerErrorPayload, ProvisioningError } from './provisioning-errors'
import { debugLog } from '../app/debug-log'

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
  onProgress?: (payload: ProvisioningProgressPayload) => void,
  options?: { timeoutMs?: number },
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    debugLog(`[provisioning] spawning provisioner: ${command} ${args.join(' ')}`)
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
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
      reject(new ProvisioningError('provisioner_unavailable', `Provisioner timed out after ${timeoutMs}ms`, {
        code: 'provisioner_timeout',
        retryable: true,
      }))
    }, timeoutMs)

    const finish = (): void => {
      clearTimeout(timer)
    }

    const maybeResolveOrReject = (event: ProvisionerEvent<T>): void => {
      if (event.protocolVersion !== PROVISIONER_PROTOCOL_VERSION) {
        settled = true
        finish()
        reject(new ProvisioningError('protocol_error', `Unsupported provisioner protocol version: ${event.protocolVersion}`, {
          code: 'unsupported_protocol_version',
        }))
        return
      }

      if (isProgressEvent(event)) {
        onProgress?.({
          requestId: request.requestId ?? '',
          message: event.message,
          stage: event.stage,
          status: event.status,
          percent: event.percent,
          retryable: event.retryable,
        })
        return
      }

      if (isErrorEvent(event)) {
        settled = true
        finish()
        reject(fromProvisionerErrorPayload(event.error))
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
          if (!line.startsWith('{')) {
            // Skip non-JSON lines (e.g. "Checking for update" from gh CLI)
            continue
          }
          try {
            maybeResolveOrReject(JSON.parse(line) as ProvisionerEvent<T>)
          } catch (err) {
            settled = true
            finish()
            reject(new ProvisioningError('protocol_error', `Invalid provisioner JSON output: ${String(err)}`, {
              code: 'invalid_provisioner_json',
            }))
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
      debugLog(`[provisioning] provisioner spawn error: ${err.message}`)
      if (settled) return
      settled = true
      finish()
      reject(new ProvisioningError('provisioner_unavailable', err.message, {
        code: 'provisioner_spawn_failed',
        retryable: true,
      }))
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
      debugLog(`[provisioning] provisioner exited with code ${code ?? 'unknown'}: ${stderrText.slice(0, 500)}`)
      reject(new ProvisioningError('provisioner_unavailable', stderrText || `Provisioner exited with code ${code ?? 'unknown'}`, {
        code: 'provisioner_exit_failure',
        retryable: true,
      }))
    })

    child.stdin.write(JSON.stringify(request))
    child.stdin.end()
  })
}
