const MEMORY_FTS_TOKEN_PATTERN = /[\p{L}\p{N}_]+/gu
const MEMORY_FTS_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'can',
  'do',
  'does',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'not',
  'that',
  'the',
  'this',
  'to',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
])

export function buildMemoryFtsQuery(query: string): string | null {
  const normalized = query.normalize('NFKC').trim()
  if (!normalized) return null

  const tokens = normalized.match(MEMORY_FTS_TOKEN_PATTERN) ?? []
  if (tokens.length === 0) return null

  const meaningfulTokens = tokens.filter((token) => !MEMORY_FTS_STOP_WORDS.has(token.toLowerCase()))
  const queryTokens = meaningfulTokens.length > 0 ? meaningfulTokens : tokens

  return queryTokens.map(quoteFtsToken).join(' ')
}

function quoteFtsToken(token: string): string {
  return `"${token.replaceAll('"', '""')}"`
}
