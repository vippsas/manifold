import { BrowserWindow, ipcMain } from 'electron'
import type { IpcDependencies } from './types'

export function registerSimpleHandlers(deps: IpcDependencies): void {
  const { chatAdapter, deploymentManager, sessionManager } = deps
  const chatUnsubscribers = new Map<string, () => void>()

  ipcMain.handle('simple:chat-messages', (_event, sessionId: string) => {
    return chatAdapter.getMessages(sessionId)
  })

  ipcMain.handle('simple:send-message', (_event, sessionId: string, text: string) => {
    chatAdapter.addUserMessage(sessionId, text)
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

  ipcMain.handle('simple:subscribe-chat', (event, sessionId: string) => {
    chatUnsubscribers.get(sessionId)?.()
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    const unsub = chatAdapter.onMessage(sessionId, (msg) => {
      if (senderWindow && !senderWindow.isDestroyed()) {
        senderWindow.webContents.send('simple:chat-message', msg)
      }
    })
    chatUnsubscribers.set(sessionId, unsub)
    return true
  })
}
