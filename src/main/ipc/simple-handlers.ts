import { BrowserWindow, ipcMain } from 'electron'
import type { IpcDependencies } from './types'
import { resolveSession } from './types'

export function registerSimpleHandlers(deps: IpcDependencies): void {
  const { chatAdapter, deploymentManager, sessionManager } = deps

  ipcMain.handle('simple:chat-messages', (_event, sessionId: string) => {
    return chatAdapter.getMessages(sessionId)
  })

  ipcMain.handle('simple:send-message', (_event, sessionId: string, text: string) => {
    chatAdapter.addUserMessage(sessionId, text)
  })

  ipcMain.handle('simple:deploy', async (_event, sessionId: string) => {
    const session = resolveSession(sessionManager, sessionId)
    const base = session.branchName.replace('manifold/', '')
    if (!base || base === session.branchName) {
      throw new Error(`Invalid branch name: expected manifold/ prefix, got ${session.branchName}`)
    }
    const cmd = deploymentManager.buildDeployCommand(`vippsas/${base}`)
    return { command: cmd.binary, args: cmd.args }
  })

  ipcMain.handle('simple:deploy-status', (_event, _sessionId: string) => {
    return { stage: 'idle', message: 'Not deployed yet' }
  })

  ipcMain.handle('simple:get-preview-url', (_event, sessionId: string) => {
    return sessionManager.getDetectedUrl(sessionId)
  })

  ipcMain.handle('simple:subscribe-chat', (event, sessionId: string) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    // onMessage returns an unsubscriber; ChatAdapter.clearSession() removes
    // all listeners for the session, so no separate tracking map is needed.
    chatAdapter.onMessage(sessionId, (msg) => {
      if (senderWindow && !senderWindow.isDestroyed()) {
        senderWindow.webContents.send('simple:chat-message', msg)
      }
    })
    return true
  })
}
