// src/plugin-host/transcription-api.ts
import { HOST_TRANSCRIPTION, type RpcEndpoint } from '../shared/plugins/rpc'
import type { AiServiceSettings, ManifoldApi } from '../shared/plugins/api-types'

interface HostTranscriptionProxy {
  $get(pluginId: string): Promise<AiServiceSettings | undefined>
}

export function createTranscriptionApi(endpoint: RpcEndpoint, pluginId: string): ManifoldApi['transcription'] {
  const host = endpoint.getProxy<HostTranscriptionProxy>(HOST_TRANSCRIPTION)
  return {
    get: () => host.$get(pluginId),
  }
}
