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
 *  This records that choice, so it survives the switch.
 *
 *  It is never pruned against the active workspace's session list — that list is someone else's
 *  the moment the user switches repos, and pruning against it is exactly how the record got lost.
 *  A stale id for a dead session is harmless (it can never match a live one) and the set holds
 *  one uuid per opened worker tab, so growth is not a concern. */
const opened = new Set<string>()

export function markAgentTabOpened(sessionId: string): void {
  opened.add(sessionId)
}

export function isAgentTabOpened(sessionId: string): boolean {
  return opened.has(sessionId)
}

/** Test-only: reset between cases. */
export function resetOpenedAgentTabs(): void {
  opened.clear()
}
