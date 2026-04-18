import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'
import type { SuperagentCreateOptions, ApprovalResponse } from '../../shared/superagent-types'

export function registerSuperagentHandlers(deps: IpcDependencies): void {
  const { superagentManager, approvalBroker } = deps

  ipcMain.handle('superagent:list', () => superagentManager.list())

  ipcMain.handle('superagent:create', async (_e, options: SuperagentCreateOptions) => {
    return superagentManager.create(options)
  })

  ipcMain.handle('superagent:kill', async (_e, id: string) => {
    await superagentManager.kill(id)
  })

  ipcMain.handle('superagent:remove', async (_e, id: string) => {
    await superagentManager.remove(id)
  })

  ipcMain.handle('superagent:resume', async (_e, id: string) => {
    await superagentManager.resume(id)
  })

  ipcMain.handle('superagent:toggle-auto-approve', (_e, id: string, value: boolean) => {
    superagentManager.setAutoApprove(id, value)
  })

  ipcMain.handle('superagent:approval-response', (_e, response: ApprovalResponse) => {
    approvalBroker.respond(response)
  })

  ipcMain.handle('superagent:list-pending-approvals', (_e, id: string) => {
    return approvalBroker.listPending(id)
  })
}
