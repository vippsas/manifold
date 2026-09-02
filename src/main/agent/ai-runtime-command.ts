import type { AgentRuntime } from '../../shared/types'
import {
  dedupeTexts,
  extractClaudeFailure,
  extractClaudeText,
  extractCodexFailure,
  extractCodexText,
  extractFallbackFailure,
} from './ai-runtime-output-parsers'

export type AiRuntimeOutputMode = 'claude-stream-json' | 'codex-jsonl' | 'plain-text'

export interface AiRuntimeCommand {
  binary: string
  args: string[]
  env?: Record<string, string>
  outputMode: AiRuntimeOutputMode
}

export function buildAiRuntimeCommand(
  runtime: AgentRuntime,
  prompt: string,
  extraArgs: string[] = [],
): AiRuntimeCommand {
  const baseArgs = [...(runtime.args ?? [])]
  const { globalArgs, commandArgs } = runtime.id === 'codex'
    ? splitCodexExtraArgs(extraArgs)
    : { globalArgs: [], commandArgs: extraArgs }

  switch (runtime.id) {
    case 'claude':
      return {
        binary: runtime.binary,
        args: [
          ...baseArgs,
          '--permission-mode',
          'bypassPermissions',
          ...extraArgs,
          '-p',
          prompt,
          '--output-format',
          'text',
        ],
        env: runtime.env,
        outputMode: 'plain-text',
      }

    case 'codex':
      return {
        binary: runtime.binary,
        args: [
          ...baseArgs,
          ...globalArgs,
          'exec',
          '--dangerously-bypass-approvals-and-sandbox',
          '--json',
          ...commandArgs,
          prompt,
        ],
        env: runtime.env,
        outputMode: 'codex-jsonl',
      }

    default:
      return {
        binary: runtime.binary,
        args: [
          ...baseArgs,
          ...extraArgs,
          '-p',
          prompt,
        ],
        env: runtime.env,
        outputMode: 'plain-text',
      }
  }
}

function splitCodexExtraArgs(extraArgs: string[]): { globalArgs: string[]; commandArgs: string[] } {
  const globalArgs: string[] = []
  const commandArgs: string[] = []

  for (const arg of extraArgs) {
    if (arg === '--search') {
      globalArgs.push(arg)
      continue
    }
    commandArgs.push(arg)
  }

  return { globalArgs, commandArgs }
}

export function parseAiRuntimeOutput(mode: AiRuntimeOutputMode, stdout: string): string {
  if (mode === 'plain-text') {
    return stdout.trim()
  }

  const texts: string[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>
      if (mode === 'claude-stream-json') {
        const text = extractClaudeText(event)
        if (text) texts.push(text)
        continue
      }

      const text = extractCodexText(event)
      if (text) texts.push(text)
    } catch {
      continue
    }
  }

  return dedupeTexts(texts).at(-1)?.trim() ?? ''
}

export function parseAiRuntimeFailure(
  mode: AiRuntimeOutputMode,
  stdout: string,
  stderr: string,
): string | null {
  if (mode === 'plain-text') {
    return stderr.trim() || extractFallbackFailure(stdout)
  }

  const failures: string[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>
      const failure = mode === 'claude-stream-json'
        ? extractClaudeFailure(event)
        : extractCodexFailure(event)
      if (failure) failures.push(failure)
    } catch {
      continue
    }
  }

  const parsedFailure = dedupeTexts(failures).at(-1)?.trim()
  if (parsedFailure) return parsedFailure

  return stderr.trim() || extractFallbackFailure(stdout)
}
