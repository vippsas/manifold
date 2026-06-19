import { HOST_VERDICTS, type RpcEndpoint } from '../shared/plugins/rpc'
import type { ManifoldApi, VerdictRecord } from '../shared/plugins/api-types'

interface HostVerdictsProxy {
  $listByProject(pluginId: string, projectId: string, limit: number | undefined): Promise<VerdictRecord[]>
  $clearProject(pluginId: string, projectId: string): Promise<void>
}

export function createVerdictsApi(endpoint: RpcEndpoint, pluginId: string): ManifoldApi['verdicts'] {
  const host = endpoint.getProxy<HostVerdictsProxy>(HOST_VERDICTS)
  return {
    listByProject: (projectId, limit) => host.$listByProject(pluginId, projectId, limit),
    clearProject: (projectId) => host.$clearProject(pluginId, projectId),
  }
}
