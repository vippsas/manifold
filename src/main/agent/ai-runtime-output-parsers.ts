export function extractClaudeText(event: Record<string, unknown>): string | null {
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

export function extractClaudeFailure(event: Record<string, unknown>): string | null {
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

export function extractCodexText(event: Record<string, unknown>): string | null {
  if (event.type === 'item.completed') {
    const item = event.item as { type?: string; text?: string } | undefined
    if (item?.type === 'agent_message' && typeof item.text === 'string') {
      return item.text.trim() || null
    }
  }

  return null
}

export function extractCodexFailure(event: Record<string, unknown>): string | null {
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

export function dedupeTexts(texts: string[]): string[] {
  const seen = new Set<string>()
  return texts.filter((text) => {
    if (seen.has(text)) return false
    seen.add(text)
    return true
  })
}

export function extractFallbackFailure(stdout: string): string | null {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return null

  const candidateLines = lines.filter((line) => !isStructuredProgressEvent(line))
  if (candidateLines.length === 0) return null

  const explicitError = [...candidateLines]
    .reverse()
    .find((line) => /^(ERROR:|Error:|error:)\s*/.test(line))
  if (explicitError) {
    return normalizeFailureMessage(explicitError.replace(/^(ERROR:|Error:|error:)\s*/, ''))
  }

  const likelyFailure = [...candidateLines]
    .reverse()
    .find((line) => /\b(error|failed|failure|denied|timed out|disconnect|not found|refused|panic)\b/i.test(line))
  return normalizeFailureMessage(likelyFailure ?? candidateLines.at(-1) ?? '')
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

function isStructuredProgressEvent(line: string): boolean {
  const parsed = tryParseJson(line)
  if (!parsed || typeof parsed !== 'object') return false

  const record = parsed as Record<string, unknown>
  const type = typeof record.type === 'string' ? record.type : null
  if (!type) return false

  if (type === 'error' || type === 'turn.failed') return false
  if (type === 'item.completed') {
    const item = record.item as { type?: string } | undefined
    if (item?.type === 'error') return false
  }

  return true
}
