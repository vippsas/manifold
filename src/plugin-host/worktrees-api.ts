import { HOST_WORKTREES, type RpcEndpoint } from '../shared/plugins/rpc'
import type { ManifoldApi, WorktreeOverviewEntry, BranchOverviewEntry } from '../shared/plugins/api-types'

interface HostWorktreesProxy {
  $list(pluginId: string): Promise<WorktreeOverviewEntry[]>
  $remove(pluginId: string, worktreePath: string, opts: { force?: boolean } | undefined): Promise<void>
  $pruneStale(pluginId: string): Promise<string[]>
  $listBranches(pluginId: string): Promise<BranchOverviewEntry[]>
}

export function createWorktreesApi(endpoint: RpcEndpoint, pluginId: string): ManifoldApi['worktrees'] {
  const host = endpoint.getProxy<HostWorktreesProxy>(HOST_WORKTREES)
  return {
    list: () => host.$list(pluginId),
    remove: (worktreePath, opts) => host.$remove(pluginId, worktreePath, opts),
    pruneStale: () => host.$pruneStale(pluginId),
    listBranches: () => host.$listBranches(pluginId),
  }
}
