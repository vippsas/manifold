const MEMORY_FTS_TOKEN_PATTERN = /[\p{L}\p{N}_]+/gu

export function buildMemoryFtsQuery(query: string): string | null {
  const normalized = query.normalize('NFKC').trim()
  if (!normalized) return null

  const tokens = normalized.match(MEMORY_FTS_TOKEN_PATTERN) ?? []
  if (tokens.length === 0) return null

  return tokens.map(quoteFtsToken).join(' ')
}

function quoteFtsToken(token: string): string {
  return `"${token.replaceAll('"', '""')}"`
}
