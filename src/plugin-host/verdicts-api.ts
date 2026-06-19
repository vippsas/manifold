import { HOST_VERDICTS, type RpcEndpoint } from '../shared/plugins/rpc'
import type { ManifoldApi, VerdictRecord, ProjectVerdicts } from '../shared/plugins/api-types'

interface HostVerdictsProxy {
  $listByProject(pluginId: string, projectId: string, limit: number | undefined): Promise<VerdictRecord[]>
  $listAll(pluginId: string): Promise<ProjectVerdicts[]>
  $clearProject(pluginId: string, projectId: string): Promise<void>
}

export function createVerdictsApi(endpoint: RpcEndpoint, pluginId: string): ManifoldApi['verdicts'] {
  const host = endpoint.getProxy<HostVerdictsProxy>(HOST_VERDICTS)
  return {
    listByProject: (projectId, limit) => host.$listByProject(pluginId, projectId, limit),
    listAll: () => host.$listAll(pluginId),
    clearProject: (projectId) => host.$clearProject(pluginId, projectId),
  }
}
