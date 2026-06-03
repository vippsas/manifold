import type { SearchMatchMode } from '../../../shared/search-types'

export interface SearchHighlightOptions {
  query: string
  matchMode: SearchMatchMode
  caseSensitive: boolean
  wholeWord: boolean
}

export interface HighlightSegment {
  text: string
  match: boolean
}

export function splitHighlightedText(
  text: string,
  options: SearchHighlightOptions,
): HighlightSegment[] {
  if (!text || !options.query.trim()) {
    return [{ text, match: false }]
  }

  const matcher = buildMatcher(options)
  if (!matcher) {
    return [{ text, match: false }]
  }

  const segments: HighlightSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = matcher.exec(text)) !== null) {
    const matchedText = match[0]
    if (!matchedText) {
      matcher.lastIndex += 1
      continue
    }

    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), match: false })
    }

    segments.push({ text: matchedText, match: true })
    lastIndex = match.index + matchedText.length
  }

  if (segments.length === 0) {
    return [{ text, match: false }]
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), match: false })
  }

  return segments
}

/**
 * Split text into match/non-match segments from an explicit set of character
 * indices (used for filename match highlighting, where the match is supplied as
 * character positions rather than a regex span). Contiguous matched indices
 * collapse into one segment.
 */
export function highlightByIndices(text: string, indices: number[]): HighlightSegment[] {
  if (!text || indices.length === 0) {
    return [{ text, match: false }]
  }

  const matched = new Set(indices)
  const segments: HighlightSegment[] = []
  let buffer = ''
  let bufferMatch = matched.has(0)

  for (let i = 0; i < text.length; i += 1) {
    const isMatch = matched.has(i)
    if (isMatch !== bufferMatch) {
      if (buffer) segments.push({ text: buffer, match: bufferMatch })
      buffer = ''
      bufferMatch = isMatch
    }
    buffer += text[i]
  }

  if (buffer) segments.push({ text: buffer, match: bufferMatch })
  return segments
}

function buildMatcher(options: SearchHighlightOptions): RegExp | null {
  const rawQuery = options.query.trim()
  if (!rawQuery) return null

  const source = options.matchMode === 'regex'
    ? rawQuery
    : escapeRegExp(rawQuery)

  const wrappedSource = options.wholeWord
    ? `\\b(?:${source})\\b`
    : source

  try {
    return new RegExp(wrappedSource, options.caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
