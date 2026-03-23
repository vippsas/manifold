import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'
import type { ProvisioningCreateRequest } from '../../shared/provisioning-types'
import { ProvisioningDispatcher } from '../provisioning/provisioning-dispatcher'

export function registerProvisioningHandlers(deps: IpcDependencies): void {
  const dispatcher = new ProvisioningDispatcher(deps.settingsStore, deps.projectRegistry)

  ipcMain.handle('provisioning:list-templates', async () => {
    return await dispatcher.listTemplates(false)
  })

  ipcMain.handle('provisioning:refresh-templates', async () => {
    return await dispatcher.listTemplates(true)
  })

  ipcMain.handle('provisioning:create', async (event, request: ProvisioningCreateRequest) => {
    return await dispatcher.create(request, (payload) => {
      event.sender.send('provisioning:progress', payload)
    })
  })
}
