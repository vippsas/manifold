import { BrowserWindow, ipcMain } from 'electron'
import type { IpcDependencies } from './types'

export function registerSimpleHandlers(deps: IpcDependencies): void {
  const { chatAdapter, sessionManager, vercelHealthCheck } = deps

  // Track active chat subscriptions per window+session to prevent duplicate listeners.
  // Key: `${webContentsId}:${sessionId}`, Value: unsubscribe function.
  const chatSubscriptions = new Map<string, () => void>()

  ipcMain.handle('simple:chat-messages', (_event, sessionId: string) => {
    const messages = chatAdapter.getMessages(sessionId)
    if (messages.length > 0) return messages

    // Hydrate from persisted store for dormant/restarted sessions
    const session = sessionManager.getSession(sessionId)
    if (session?.projectId && session.worktreePath) {
      return chatAdapter.loadMessages(sessionId, session.worktreePath, session.projectId)
    }
    if (session && (!session.projectId || !session.worktreePath)) {
      console.warn(
        `[simple:chat-messages] session ${sessionId} missing projectId or worktreePath — chat history will appear empty and new messages will not persist`,
        { projectId: session.projectId, worktreePath: session.worktreePath },
      )
    }
    return messages
  })

  ipcMain.handle('simple:send-message', (_event, sessionId: string, text: string) => {
    chatAdapter.addUserMessage(sessionId, text)
  })

  ipcMain.handle('simple:deploy', async (_event, sessionId: string) => {
    const health = await vercelHealthCheck.getHealthStatus()
    if (!health.cliInstalled || !health.authenticated) {
      return { needsSetup: true, health }
    }

    sessionManager.sendInput(
      sessionId,
      'Deploy this application to Vercel production using `vercel deploy --prod --yes`. Report the production URL when complete.\n'
    )

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('simple:deploy-status-update', {
          sessionId,
          stage: 'deploying',
          message: 'Deploying to Vercel...',
        })
      }
    }

    return { needsSetup: false }
  })

  ipcMain.handle('simple:deploy-status', (_event, _sessionId: string) => {
    return deps.vercelHealthCheck.getHealthStatus()
  })

  ipcMain.handle('simple:deploy-install-cli', async () => {
    await deps.vercelHealthCheck.installCli()
  })

  ipcMain.handle('simple:deploy-login', async () => {
    await deps.vercelHealthCheck.login()
  })

  ipcMain.handle('simple:get-preview-url', (_event, sessionId: string) => {
    return sessionManager.getDetectedUrl(sessionId)
  })

  ipcMain.handle('simple:get-agent-status', (_event, sessionId: string) => {
    return sessionManager.getSessionStatus(sessionId)
  })

  ipcMain.handle('simple:get-slash-commands', (_event, sessionId: string) => {
    return sessionManager.getSlashCommands(sessionId)
  })

  ipcMain.handle('simple:subscribe-chat', (event, sessionId: string) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    const key = `${event.sender.id}:${sessionId}`

    // Ensure session→storage mapping is set for new messages to be persisted
    const session = sessionManager.getSession(sessionId)
    if (session?.projectId && session.worktreePath) {
      chatAdapter.setSessionStorage(sessionId, session.worktreePath, session.projectId)
      // Hydrate from store if not yet loaded
      if (chatAdapter.getMessages(sessionId).length === 0) {
        chatAdapter.loadMessages(sessionId, session.worktreePath, session.projectId)
      }
    } else if (session) {
      console.warn(
        `[simple:subscribe-chat] session ${sessionId} missing projectId or worktreePath — new messages will not be persisted to disk`,
        { projectId: session.projectId, worktreePath: session.worktreePath },
      )
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
