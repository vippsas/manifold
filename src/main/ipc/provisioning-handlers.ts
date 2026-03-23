import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'
import type { ProvisionerConfig, ProvisionerStatus, ProvisioningCreateRequest } from '../../shared/provisioning-types'
import { ProvisioningDispatcher } from '../provisioning/provisioning-dispatcher'

function createDispatcher(deps: IpcDependencies, draftProvisioners?: ProvisionerConfig[]): ProvisioningDispatcher {
  if (!draftProvisioners) {
    return new ProvisioningDispatcher(deps.settingsStore, deps.projectRegistry)
  }

  const settingsStore = {
    getSettings: () => ({
      ...deps.settingsStore.getSettings(),
      provisioning: {
        provisioners: draftProvisioners.map((provisioner) => ({ ...provisioner, enabled: true })),
      },
    }),
  }

  return new ProvisioningDispatcher(settingsStore as never, deps.projectRegistry)
}

function restoreEnabledState(statuses: ProvisionerStatus[], provisioners?: ProvisionerConfig[]): ProvisionerStatus[] {
  if (!provisioners) return statuses
  const enabledById = new Map(provisioners.map((provisioner) => [provisioner.id, provisioner.enabled]))
  return statuses.map((status) => ({ ...status, enabled: enabledById.get(status.provisionerId) ?? status.enabled }))
}

export function registerProvisioningHandlers(deps: IpcDependencies): void {
  ipcMain.handle('provisioning:list-templates', async (_event, provisionerId?: string, draftProvisioners?: ProvisionerConfig[]) => {
    const dispatcher = createDispatcher(deps, draftProvisioners)
    return await dispatcher.listTemplates(false, provisionerId)
  })

  ipcMain.handle('provisioning:refresh-templates', async (_event, provisionerId?: string, draftProvisioners?: ProvisionerConfig[]) => {
    const dispatcher = createDispatcher(deps, draftProvisioners)
    const catalog = await dispatcher.listTemplates(true, provisionerId)
    return { ...catalog, provisioners: restoreEnabledState(catalog.provisioners, draftProvisioners) }
  })

  ipcMain.handle('provisioning:get-statuses', async (_event, draftProvisioners?: ProvisionerConfig[]) => {
    const dispatcher = createDispatcher(deps, draftProvisioners)
    return restoreEnabledState(await dispatcher.getProvisionerStatuses(), draftProvisioners)
  })

  ipcMain.handle('provisioning:check-health', async (_event, provisionerId?: string, draftProvisioners?: ProvisionerConfig[]) => {
    const dispatcher = createDispatcher(deps, draftProvisioners)
    return restoreEnabledState(await dispatcher.checkHealth(provisionerId), draftProvisioners)
  })

  ipcMain.handle('provisioning:create', async (event, request: ProvisioningCreateRequest) => {
    const dispatcher = new ProvisioningDispatcher(deps.settingsStore, deps.projectRegistry)
    return await dispatcher.create(request, (payload) => {
      event.sender.send('provisioning:progress', payload)
    })
  })
}
