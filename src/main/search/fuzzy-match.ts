export interface FuzzyMatch {
  score: number
  /** Indices into the target string that the query matched, ascending. */
  indices: number[]
}

// Contiguous substring matches live in a score band above any subsequence
// match, so a file that literally contains the query always outranks a file
// that only matches it fuzzily.
const SUBSTRING_FLOOR = 1000
const SUBSTRING_BASENAME_BONUS = 100
const SUBSTRING_BOUNDARY_BONUS = 30

const SUBSEQ_BOUNDARY_BONUS = 12
const SUBSEQ_CONSECUTIVE_BONUS = 8
const SUBSEQ_BASENAME_BONUS = 6

/**
 * Fuzzy-match a query against a path, case-insensitively. Prefers a contiguous
 * substring (ideally in the basename), then falls back to a subsequence match.
 * Returns null when the query is not a subsequence of the target.
 */
export function fuzzyScore(query: string, target: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase()
  if (!q) return null

  const lower = target.toLowerCase()
  if (q.length > lower.length) return null

  const basenameStart = lower.lastIndexOf('/') + 1
  return matchSubstring(q, lower, target, basenameStart) ?? matchSubsequence(q, lower, target, basenameStart)
}

function matchSubstring(
  query: string,
  lower: string,
  target: string,
  basenameStart: number,
): FuzzyMatch | null {
  // Prefer an occurrence inside the basename, then anywhere in the path.
  let start = lower.indexOf(query, basenameStart)
  if (start === -1) start = lower.indexOf(query)
  if (start === -1) return null

  const indices: number[] = []
  for (let i = 0; i < query.length; i += 1) indices.push(start + i)

  let score = SUBSTRING_FLOOR
  if (start >= basenameStart) score += SUBSTRING_BASENAME_BONUS
  if (isBoundary(target, start)) score += SUBSTRING_BOUNDARY_BONUS
  score -= start // earlier matches rank higher
  score -= Math.floor(lower.length / 8) // shorter paths rank mildly higher
  return { score, indices }
}

function matchSubsequence(
  query: string,
  lower: string,
  target: string,
  basenameStart: number,
): FuzzyMatch | null {
  const indices: number[] = []
  let queryIndex = 0
  let previous = -2
  let score = 0

  for (let i = 0; i < lower.length && queryIndex < query.length; i += 1) {
    if (lower[i] !== query[queryIndex]) continue

    let charScore = 1
    if (isBoundary(target, i)) charScore += SUBSEQ_BOUNDARY_BONUS
    if (i === previous + 1) charScore += SUBSEQ_CONSECUTIVE_BONUS
    if (i >= basenameStart) charScore += SUBSEQ_BASENAME_BONUS

    score += charScore
    indices.push(i)
    previous = i
    queryIndex += 1
  }

  if (queryIndex < query.length) return null
  score -= indices[0] // penalize a late first match
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
