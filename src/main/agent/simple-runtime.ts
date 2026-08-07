import { getRuntimeById } from './runtimes'
import { buildWorkingSetArgs } from './working-set-args'

export type SimpleRuntimeOutputMode = 'claude-stream-json' | 'codex-jsonl' | 'plain-text'

export interface SimpleRuntimeCommand {
  binary: string
  args: string[]
  env?: Record<string, string>
  outputMode: SimpleRuntimeOutputMode
}

/** Argv for a one-shot (print-mode) turn.
 *
 *  `additionalDirs` carries the rest of a workspace's folders. The flags must be
 *  placed before the prompt: Codex takes the prompt as a positional argument, so
 *  anything appended after it is parsed as part of that positional. */
export function buildSimpleRuntimeCommand(
  runtimeId: string,
  prompt: string,
  additionalDirs: string[] = [],
): SimpleRuntimeCommand {
  const runtime = getRuntimeById(runtimeId)
  if (!runtime) throw new Error(`Runtime not found: ${runtimeId}`)

  const baseArgs = [...(runtime.args ?? [])]
  const workingSet = buildWorkingSetArgs(runtimeId, additionalDirs)

  switch (runtimeId) {
    case 'claude':
      return {
        binary: runtime.binary,
        args: [
          ...baseArgs,
          '--permission-mode', 'bypassPermissions',
          ...workingSet,
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
          '--dangerously-bypass-approvals-and-sandbox',
          '--json',
          ...workingSet,
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
          ...workingSet,
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
          ...workingSet,
          '-p',
          prompt,
        ],
        env: runtime.env,
        outputMode: 'plain-text',
      }
  }
}
