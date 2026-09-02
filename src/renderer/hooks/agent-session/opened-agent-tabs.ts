/** Grouped agent sessions the user explicitly opened a tab for.
 *
 *  `useAgentSiblingDockTabs` auto-creates a tab for every *ungrouped* agent, and deliberately not
 *  for grouped ones: a Viola run spawns an implementer and a reviewer per task, so auto-tabbing
 *  them would put eight tabs in the dock bar. Those tabs are opened on demand instead — from the
 *  run board, or any owner UI that calls `openSiblingPanel`.
 *
 *  On demand alone is not enough to keep one, though. There is a single window-wide dock layout,
 *  and switching repositories reloads it and strips sibling panels whose session is not in the new
 *  workspace. Coming back, an ungrouped agent's tab is recreated by the auto-tab pass, but a
 *  grouped one has nothing to recreate it — so the worker tab the user opened simply vanished.
 *  This records that choice, so it survives the switch. */
const opened = new Set<string>()

export function markAgentTabOpened(sessionId: string): void {
  opened.add(sessionId)
}

export function isAgentTabOpened(sessionId: string): boolean {
  return opened.has(sessionId)
}

/** Drop marks for sessions that no longer exist, so the set can't grow unbounded. */
export function pruneOpenedAgentTabs(knownSessionIds: Set<string>): void {
  for (const id of opened) {
    if (!knownSessionIds.has(id)) opened.delete(id)
  }
}

/** Test-only: reset between cases. */
export function resetOpenedAgentTabs(): void {
  opened.clear()
}
