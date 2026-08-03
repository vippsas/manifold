import { useEffect, useState } from 'react'

/**
 * The branch each folder currently has checked out, for the sidebar's folder
 * rows. Only home workspaces need it — a worktree workspace puts every folder on
 * its own branch, which the workspace card names once.
 *
 * Re-read whenever the folder set or `refreshKey` changes; pass something that
 * moves when a branch might have (the agent list, say). Nothing polls: a clone's
 * branch only changes when the user or an agent switches it.
 */
export function useFolderBranches(projectIds: string[], refreshKey?: unknown): Record<string, string> {
  const [branches, setBranches] = useState<Record<string, string>>({})
  const key = projectIds.join(',')

  useEffect(() => {
    let cancelled = false
    const ids = key ? key.split(',') : []
    if (ids.length === 0) {
      setBranches({})
      return
    }
    void Promise.all(
      ids.map(async (id) => [id, await readBranch(id)] as const),
    ).then((entries) => {
      if (cancelled) return
      setBranches(Object.fromEntries(entries.filter(([, branch]) => branch)))
    })
    return () => { cancelled = true }
  }, [key, refreshKey])

  return branches
}

async function readBranch(projectId: string): Promise<string> {
  try {
    const branch = await window.electronAPI.invoke('git:current-branch', projectId)
    return typeof branch === 'string' ? branch : ''
  } catch {
    return ''
  }
}
