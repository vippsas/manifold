import { BrowserWindow, ipcMain } from 'electron'
import type { IpcDependencies } from './types'

export function registerSimpleHandlers(deps: IpcDependencies): void {
  const { chatAdapter, deploymentManager, sessionManager } = deps

  ipcMain.handle('simple:chat-messages', (_event, sessionId: string) => {
    return chatAdapter.getMessages(sessionId)
  })

  ipcMain.handle('simple:deploy', async (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error('Session not found')
    const repoName = `vippsas/${session.branchName.replace('manifold/', '')}`
    const cmd = deploymentManager.buildDeployCommand(repoName)
    return { command: cmd.binary, args: cmd.args }
  })

  ipcMain.handle('simple:deploy-status', (_event, _sessionId: string) => {
    return { stage: 'idle', message: 'Not deployed yet' }
  })

  ipcMain.handle('simple:subscribe-chat', (_event, sessionId: string) => {
    chatAdapter.onMessage(sessionId, (msg) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        win.webContents.send('simple:chat-message', msg)
      }
    })
    return true
  })

  // Preview URL is handled by the existing `preview:url-detected` push channel
  // from SessionManager (web preview feature) — no handler needed here.
}
