interface FuzzyResult {
  value: string
  score: number
}

const WORD_BOUNDARY = '/._- '

/**
 * Scores a greedy subsequence match starting at `startTi` within `t`.
 * Returns null if `q` is not a subsequence of `t[startTi..]`.
 * `slash` is the index of the last '/' in `t`; the basename bonus is applied
 * here when the final matched index lands past it.
 *
 * Note: indexing is by UTF-16 code unit, which is fine for ASCII-ish file
 * paths but not designed for non-BMP characters (e.g. emoji).
 */
function scoreFrom(q: string, t: string, startTi: number, slash: number): number | null {
  let qi = 0
  let score = 0
  let prevMatch = -2
  for (let ti = startTi; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (ti === prevMatch + 1) score += 8 // +8 contiguous run
      if (ti === 0 || WORD_BOUNDARY.includes(t[ti - 1])) score += 4 // +4 word-boundary start
      score += 1 // +1 base match
      prevMatch = ti
      qi++
    }
  }
  if (qi < q.length) return null
  if (slash >= 0 && prevMatch > slash) score += 3 // +3 basename bonus
  return score
}

/**
 * Scores how well `query` fuzzy-matches `target` (case-insensitive subsequence).
 * Higher is better. Returns null if `query` is not a subsequence of `target`.
 * Rewards contiguous runs, word-boundary starts, and matches in the basename.
 *
 * Tries matching from each path-segment boundary to find the best alignment,
 * preventing a scattered path (e.g. `c/o/d/e/`) from beating a true basename match.
 */
export function fuzzyScore(query: string, target: string): number | null {
  // Sentinel for the empty query; fuzzyFilter handles empty queries separately
  // by returning the list unscored, so this branch is mostly for direct callers.
  if (query.length === 0) return 0
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  // Collect segment-start positions (start of each component after a '/')
  const boundaries: number[] = [0]
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '/') boundaries.push(i + 1)
  }

  const slash = t.lastIndexOf('/')
  let best: number | null = null

  for (const start of boundaries) {
    const s = scoreFrom(q, t, start, slash)
    if (s !== null && (best === null || s > best)) best = s
  }

  if (best === null) return null
  return best - target.length * 0.01 // slight penalty for longer paths
}

/** Filters and ranks `items` against `query`, returning at most `limit` values. */
export function fuzzyFilter(query: string, items: string[], limit = 100): string[] {
  if (query.trim() === '') return items.slice(0, limit)
  const scored: FuzzyResult[] = []
  for (const value of items) {
    const score = fuzzyScore(query, value)
    if (score !== null) scored.push({ value, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((result) => result.value)
}
