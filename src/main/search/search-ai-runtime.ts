import { getRuntimeById } from '../agent/runtimes'
import type { IpcDependencies } from '../ipc/types'

interface SearchAiRuntimeDeps {
  settingsStore: IpcDependencies['settingsStore']
  sessionManager: IpcDependencies['sessionManager']
}

export function resolveSearchAiRuntime(
  deps: SearchAiRuntimeDeps,
  activeSessionId: string | null,
  configuredRuntimeId: string,
) {
  const settings = deps.settingsStore.getSettings()
  const runtimeId = configuredRuntimeId !== 'default'
    ? configuredRuntimeId
    : deps.sessionManager.getSession(activeSessionId ?? '')?.runtimeId ?? settings.defaultRuntime

  return {
    runtimeId,
    runtime: getRuntimeById(runtimeId),
  }
}
