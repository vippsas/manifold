import { useEffect, useState } from 'react'
import type { ScmFileTarget } from '../../components/editor/file-open-request'

export interface WorkspaceFileDiff {
  diff: string | null
  original: string | null
}

const EMPTY: WorkspaceFileDiff = { diff: null, original: null }

/** The uncommitted diff of one file in a workspace checkout — what the editor
 *  shows for a Source Control click (working tree vs HEAD), where the session
 *  diff (vs the base branch) doesn't apply. Null target ⇒ no fetch. */
export function useWorkspaceFileDiff(target: ScmFileTarget | null): WorkspaceFileDiff {
  const [result, setResult] = useState<WorkspaceFileDiff>(EMPTY)
  const workspaceId = target?.workspaceId ?? null
  const projectId = target?.projectId ?? null
  const relPath = target?.relPath ?? null

  useEffect(() => {
    if (!workspaceId || !projectId || !relPath) {
      setResult(EMPTY)
      return
    }
    let cancelled = false
    void (async (): Promise<void> => {
      try {
        const fetched = (await window.electronAPI.invoke(
          'git:workspace-file-diff',
          workspaceId,
          projectId,
          relPath,
        )) as WorkspaceFileDiff
        if (!cancelled) setResult(fetched)
      } catch {
        if (!cancelled) setResult(EMPTY)
      }
    })()
    return () => { cancelled = true }
  }, [workspaceId, projectId, relPath])

  return result
}
