/** Compact relative time, e.g. "today", "3d ago", "2w ago", "2mo ago". `now` is injected for testability. */
export function relativeTime(iso: string | null, now: number): string {
  if (!iso) return '—'
  const days = Math.round((now - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.round(days / 7)}w ago`
  if (days < 365) return `${Math.round(days / 30)}mo ago`
  return `${Math.round(days / 365)}y ago`
}

/** Split a branch into its dimmed namespace prefix (`repo/`) and the rest. */
export function splitBranch(branch: string): { ns: string; rest: string } {
  const i = branch.indexOf('/')
  return i < 0 ? { ns: '', rest: branch } : { ns: branch.slice(0, i + 1), rest: branch.slice(i + 1) }
}
