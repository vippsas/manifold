/** Agent sessions whose dock tab the user hid from the group header's × (see
 *  AgentHeaderActions). The session stays alive; only its tab is gone.
 *
 *  This exists because `useAgentSiblingDockTabs` auto-creates a tab for every
 *  live ungrouped agent and re-runs constantly (opening a file, streaming
 *  output). Without a record of what the user hid, that effect would recreate a
 *  just-closed tab on its next pass. Reopening the agent (selecting it in the
 *  sidebar, or `openSiblingPanel`) clears the mark, so the tab comes back. */
const dismissed = new Set<string>()

export function markAgentTabDismissed(sessionId: string): void {
  dismissed.add(sessionId)
}

export function clearAgentTabDismissed(sessionId: string): void {
  dismissed.delete(sessionId)
}

export function isAgentTabDismissed(sessionId: string): boolean {
  return dismissed.has(sessionId)
}

/** Drop marks for sessions that no longer exist, so a deleted agent's id can't
 *  linger and suppress a future session (ids are unique, but this keeps the set
 *  from growing unbounded across a long session). */
export function pruneDismissedAgentTabs(knownSessionIds: Set<string>): void {
  for (const id of dismissed) {
    if (!knownSessionIds.has(id)) dismissed.delete(id)
  }
}

/** Test-only: reset between cases. */
export function resetDismissedAgentTabs(): void {
  dismissed.clear()
}
