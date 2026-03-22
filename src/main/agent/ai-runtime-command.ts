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
          'stream-json',
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

function extractCodexText(event: Record<string, unknown>): string | null {
  if (event.type === 'item.completed') {
    const item = event.item as { type?: string; text?: string } | undefined
    if (item?.type === 'agent_message' && typeof item.text === 'string') {
      return item.text.trim() || null
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
