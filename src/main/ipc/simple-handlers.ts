import { BrowserWindow, ipcMain } from 'electron'
import { chatStorageKey } from '../agent/chat-adapter'
import type { IpcDependencies } from './types'

export function registerSimpleHandlers(deps: IpcDependencies): void {
  const { chatAdapter, sessionManager } = deps

  // Track active chat subscriptions per window+session to prevent duplicate listeners.
  // Key: `${webContentsId}:${sessionId}`, Value: unsubscribe function.
  const chatSubscriptions = new Map<string, () => void>()
  // Windows whose teardown is already wired. One 'destroyed' listener per window, not per
  // subscription: a window subscribes once per session it shows — a Viola run alone spawns
  // several — and re-subscribes on every remount, so registering per call walks straight past
  // Electron's ten-listener warning on the WebContents emitter.
  const teardownWired = new Set<number>()

  ipcMain.handle('simple:chat-messages', (_event, sessionId: string) => {
    const messages = chatAdapter.getMessages(sessionId)
    if (messages.length > 0) return messages

    // Hydrate from persisted store for dormant/restarted sessions
    const session = sessionManager.getSession(sessionId)
    if (session?.projectId && session.worktreePath) {
      return chatAdapter.loadMessages(
        sessionId,
        chatStorageKey(session.worktreePath, sessionId),
        session.projectId,
      )
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
    const senderId = event.sender.id
    const key = `${senderId}:${sessionId}`

    // Ensure session→storage mapping is set for new messages to be persisted
    const session = sessionManager.getSession(sessionId)
    if (session?.projectId && session.worktreePath) {
      const storageKey = chatStorageKey(session.worktreePath, sessionId)
      chatAdapter.setSessionStorage(sessionId, storageKey, session.projectId)
      // Hydrate from store if not yet loaded
      if (chatAdapter.getMessages(sessionId).length === 0) {
        chatAdapter.loadMessages(sessionId, storageKey, session.projectId)
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

    // Clean up every subscription this window held once it is destroyed.
    if (!teardownWired.has(senderId)) {
      teardownWired.add(senderId)
      event.sender.once('destroyed', () => {
        const prefix = `${senderId}:`
        for (const [entryKey, unsubscribe] of chatSubscriptions) {
          if (!entryKey.startsWith(prefix)) continue
          unsubscribe()
          chatSubscriptions.delete(entryKey)
        }
        teardownWired.delete(senderId)
      })
    }

    return true
  })
}
