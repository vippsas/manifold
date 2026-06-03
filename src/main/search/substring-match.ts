export interface SubstringMatch {
  score: number
  /** Indices into the target string that the query matched, ascending. */
  indices: number[]
}

const BASENAME_BONUS = 100
const BOUNDARY_BONUS = 30

/**
 * Match a query against a path as a contiguous, case-insensitive substring.
 * The whole query must appear verbatim — scattered letters don't match, so
 * "lidl" never matches "linkedin-article.md". A hit inside the basename, or at
 * a word boundary, ranks higher. Returns null when the query is absent.
 */
export function substringScore(query: string, target: string): SubstringMatch | null {
  const q = query.trim().toLowerCase()
  if (!q) return null

  const lower = target.toLowerCase()
  const basenameStart = lower.lastIndexOf('/') + 1

  // Prefer an occurrence inside the basename, then anywhere in the path.
  let start = lower.indexOf(q, basenameStart)
  if (start === -1) start = lower.indexOf(q)
  if (start === -1) return null

  const indices: number[] = []
  for (let i = 0; i < q.length; i += 1) indices.push(start + i)

  let score = 1000
  if (start >= basenameStart) score += BASENAME_BONUS
  if (isBoundary(target, start)) score += BOUNDARY_BONUS
  score -= start // earlier matches rank higher
  score -= Math.floor(lower.length / 8) // shorter paths rank mildly higher
  return { score, indices }
}

function isBoundary(target: string, index: number): boolean {
  if (index <= 0) return true
  const prev = target[index - 1]
  if (prev === '/' || prev === '.' || prev === '_' || prev === '-' || prev === ' ') return true
  // camelCase boundary: a non-uppercase char followed by an uppercase one.
  const cur = target[index]
  return prev.toLowerCase() === prev && cur.toLowerCase() !== cur
}
