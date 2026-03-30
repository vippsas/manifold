import type { AgentRuntime } from '../../shared/types'

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
          'exec',
          '--full-auto',
          '--json',
          ...extraArgs,
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

function extractClaudeText(event: Record<string, unknown>): string | null {
  const type = event.type
  if (type === 'assistant') {
    const message = event.message as { content?: Array<{ type?: string; text?: string }> } | undefined
    const text = message?.content
      ?.filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text?.trim() ?? '')
      .filter(Boolean)
      .join('\n')
    return text || null
  }

  if (type === 'result' && event.subtype === 'success' && typeof event.result === 'string') {
    return event.result.trim() || null
  }

  return null
}

function extractClaudeFailure(event: Record<string, unknown>): string | null {
  if (typeof event.message === 'string' && event.type === 'error') {
    return normalizeFailureMessage(event.message)
  }

  if (event.type === 'result' && event.subtype === 'error' && typeof event.result === 'string') {
    return normalizeFailureMessage(event.result)
  }

  const error = event.error as { message?: string } | undefined
  if (typeof error?.message === 'string') {
    return normalizeFailureMessage(error.message)
  }

  return null
}

function extractCodexText(event: Record<string, unknown>): string | null {
  if (event.type === 'item.completed') {
    const item = event.item as { type?: string; text?: string } | undefined
    if (item?.type === 'agent_message' && typeof item.text === 'string') {
      return item.text.trim() || null
    }
  }

  return null
}

function extractCodexFailure(event: Record<string, unknown>): string | null {
  if (typeof event.message === 'string' && event.type === 'error') {
    return normalizeFailureMessage(event.message)
  }

  if (event.type === 'item.completed') {
    const item = event.item as { type?: string; message?: string } | undefined
    if (item?.type === 'error' && typeof item.message === 'string') {
      return normalizeFailureMessage(item.message)
    }
  }

  if (event.type === 'turn.failed') {
    const error = event.error as { message?: string } | undefined
    if (typeof error?.message === 'string') {
      return normalizeFailureMessage(error.message)
    }
  }

  return null
}

function dedupeTexts(texts: string[]): string[] {
  const seen = new Set<string>()
  return texts.filter((text) => {
    if (seen.has(text)) return false
    seen.add(text)
    return true
  })
}

function extractFallbackFailure(stdout: string): string | null {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return null

  const explicitError = [...lines]
    .reverse()
    .find((line) => /^(ERROR:|Error:|error:)\s*/.test(line))
  if (explicitError) {
    return normalizeFailureMessage(explicitError.replace(/^(ERROR:|Error:|error:)\s*/, ''))
  }

  const likelyFailure = [...lines]
    .reverse()
    .find((line) => /\b(error|failed|failure|denied|timed out|disconnect|not found|refused|panic)\b/i.test(line))
  return normalizeFailureMessage(likelyFailure ?? lines.at(-1) ?? '')
}

function normalizeFailureMessage(message: string): string | null {
  const trimmed = message.trim()
  if (!trimmed) return null

  const parsed = tryParseJson(trimmed)
  if (parsed) {
    return extractErrorMessage(parsed) ?? trimmed
  }

  return trimmed
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function extractErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const nestedError = record.error
  if (nestedError && typeof nestedError === 'object') {
    const nestedMessage = (nestedError as Record<string, unknown>).message
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      return nestedMessage.trim()
    }
  }

  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message.trim()
  }

  return null
}
