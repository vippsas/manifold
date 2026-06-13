/**
 * Pick the next agent when cycling forward (+1) or backward (-1) through an
 * ordered session list, wrapping at the ends. With no (or an unknown) active
 * agent, forward starts at the first and backward at the last. Returns null
 * only when the list is empty.
 */
export function cycleAgent<T extends { id: string }>(
  sessions: T[],
  activeId: string | null,
  direction: 1 | -1,
): T | null {
  if (sessions.length === 0) return null
  const current = sessions.findIndex((s) => s.id === activeId)
  if (current === -1) return direction === 1 ? sessions[0] : sessions[sessions.length - 1]
  const next = (current + direction + sessions.length) % sessions.length
  return sessions[next]
}
