import { BrowserWindow, ipcMain } from 'electron'
import type { IpcDependencies } from './types'
import { resolveSession } from './types'

export function registerSimpleHandlers(deps: IpcDependencies): void {
  const { chatAdapter, deploymentManager, sessionManager } = deps

  // Track active chat subscriptions per window+session to prevent duplicate listeners.
  // Key: `${webContentsId}:${sessionId}`, Value: unsubscribe function.
  const chatSubscriptions = new Map<string, () => void>()

  ipcMain.handle('simple:chat-messages', (_event, sessionId: string) => {
    const messages = chatAdapter.getMessages(sessionId)
    if (messages.length > 0) return messages

    // Hydrate from persisted store for dormant/restarted sessions
    const session = sessionManager.getSession(sessionId)
    if (session?.projectId) {
      return chatAdapter.loadMessages(sessionId, session.projectId)
    }
    return messages
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

  ipcMain.handle('simple:get-agent-status', (_event, sessionId: string) => {
    return sessionManager.getSessionStatus(sessionId)
  })

  ipcMain.handle('simple:subscribe-chat', (event, sessionId: string) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    const key = `${event.sender.id}:${sessionId}`

    // Ensure session→project mapping is set for new messages to be persisted
    const session = sessionManager.getSession(sessionId)
    if (session?.projectId) {
      chatAdapter.setSessionProject(sessionId, session.projectId)
      // Hydrate from store if not yet loaded
      if (chatAdapter.getMessages(sessionId).length === 0) {
        chatAdapter.loadMessages(sessionId, session.projectId)
      }
    }

    // Unsubscribe any existing listener for this window+session to avoid duplicates
    chatSubscriptions.get(key)?.()

    const unsub = chatAdapter.onMessage(sessionId, (msg) => {
      if (senderWindow && !senderWindow.isDestroyed()) {
        senderWindow.webContents.send('simple:chat-message', msg)
      }
    })
    chatSubscriptions.set(key, unsub)
    return true
  })
}
