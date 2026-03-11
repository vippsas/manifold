import { getRuntimeById } from './runtimes'

export type SimpleRuntimeOutputMode = 'claude-stream-json' | 'codex-jsonl' | 'plain-text'

export interface SimpleRuntimeCommand {
  binary: string
  args: string[]
  env?: Record<string, string>
  outputMode: SimpleRuntimeOutputMode
}

export function buildSimpleRuntimeCommand(runtimeId: string, prompt: string): SimpleRuntimeCommand {
  const runtime = getRuntimeById(runtimeId)
  if (!runtime) throw new Error(`Runtime not found: ${runtimeId}`)

  const baseArgs = [...(runtime.args ?? [])]

  switch (runtimeId) {
    case 'claude':
      return {
        binary: runtime.binary,
        args: [
          ...baseArgs,
          '--permission-mode', 'bypassPermissions',
          '-p', prompt,
          '--output-format', 'stream-json',
          '--verbose',
        ],
        env: runtime.env,
        outputMode: 'claude-stream-json',
      }

    case 'codex':
      return {
        binary: runtime.binary,
        args: [
          ...baseArgs,
          'exec',
          '--full-auto',
          '--json',
          prompt,
        ],
        env: runtime.env,
        outputMode: 'codex-jsonl',
      }

    case 'gemini':
      return {
        binary: runtime.binary,
        args: [
          ...baseArgs,
          '-p',
          prompt,
        ],
        env: runtime.env,
        outputMode: 'plain-text',
      }

    default:
      return {
        binary: runtime.binary,
        args: [
          ...baseArgs,
          '-p',
          prompt,
        ],
        env: runtime.env,
        outputMode: 'plain-text',
      }
  }
}
