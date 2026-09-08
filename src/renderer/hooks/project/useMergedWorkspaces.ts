import { useEffect, useState } from 'react'
import type { AgentSession } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

const EMPTY: ReadonlySet<string> = new Set()
let warned = false

/** Ids of worktree workspaces whose branch is recorded as merged, so the
 *  sidebar can fold them. Re-asked whenever the set of workspaces or of
 *  sessions changes: verdicts finalize when a session terminates, so that is
 *  when the answer can move. A merge the background PR poll finds later shows
 *  on the next such change or relaunch — the fold is tidiness, not truth.
 *  Failure leaves the set empty: nothing folds, the list is merely longer. */
export function useMergedWorkspaces(
  workspaces: readonly Workspace[],
  sessionsByWorkspace: Record<string, AgentSession[]>,
): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(EMPTY)
  const workspaceKey = workspaces.map((w) => w.id).join('|')
  const sessionKey = Object.values(sessionsByWorkspace).flat().map((s) => s.id).sort().join('|')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        // `await` on a bare mock (undefined) is fine: tests that never stub the
        // channel just see an empty set.
        const result = (await window.electronAPI.invoke('workspace:list-merged')) as string[] | undefined
        if (!cancelled) setIds(new Set(result ?? []))
      } catch (err) {
        if (!warned) {
          warned = true
          console.warn('[useMergedWorkspaces] could not read merged workspaces', err)
        }
        if (!cancelled) setIds(EMPTY)
      }
    })()
    return () => { cancelled = true }
  }, [workspaceKey, sessionKey])

  return ids
}
