import { useMemo } from 'react'
import type { Superagent } from '../../shared/superagent-types'

export interface UseSuperagentFileBridgeResult {
  superagentFileReader: ((filePath: string) => Promise<string>) | null
  superagentFileWriter: ((filePath: string, content: string) => Promise<void>) | null
}

export function useSuperagentFileBridge(activeSuperagent: Superagent | null): UseSuperagentFileBridgeResult {
  return useMemo(() => {
    if (!activeSuperagent) return { superagentFileReader: null, superagentFileWriter: null }
    const worktreeEntries = Object.entries(activeSuperagent.fleetWorktreePaths ?? {})
    if (worktreeEntries.length === 0) return { superagentFileReader: null, superagentFileWriter: null }
    const resolveProjectId = (filePath: string): string => {
      const match = worktreeEntries.find(
        ([, root]) => filePath === root || filePath.startsWith(root.endsWith('/') ? root : root + '/'),
      )
      if (!match) throw new Error(`File ${filePath} is not under any fleet worktree`)
      return match[0]
    }
    const superagentFileReader = async (filePath: string): Promise<string> => {
      const projectId = resolveProjectId(filePath)
      return (await window.electronAPI.invoke(
        'files:read-for-superagent-project', activeSuperagent.id, projectId, filePath,
      )) as string
    }
    const superagentFileWriter = async (filePath: string, content: string): Promise<void> => {
      const projectId = resolveProjectId(filePath)
      await window.electronAPI.invoke(
        'files:write-for-superagent-project', activeSuperagent.id, projectId, filePath, content,
      )
    }
    return { superagentFileReader, superagentFileWriter }
  }, [activeSuperagent])
}
