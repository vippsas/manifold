import { vi } from 'vitest'
import type { AheadBehind, FileTreeNode } from '../../../shared/types'

export const restoredTree: FileTreeNode = {
  name: 'worktree', path: '/worktree', isDirectory: true,
  children: [{ name: 'README.md', path: '/worktree/README.md', isDirectory: false }],
}

/** In-memory main-process boundary: reads miss until discovery registers a session. */
export class SessionReadinessApi {
  private sessions = new Map<string, { tree: FileTreeNode; aheadBehind: AheadBehind }>()
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  invoke = vi.fn(async (channel: string, sessionId: unknown): Promise<unknown> => {
    const session = this.sessions.get(sessionId as string)
    if (channel === 'files:tree') return session?.tree ?? null
    if (channel === 'git:ahead-behind') return session?.aheadBehind ?? { ahead: 0, behind: 0 }
    throw new Error(`Unexpected channel: ${channel}`)
  })

  on = (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
    const listeners = this.listeners.get(channel) ?? new Set()
    listeners.add(listener)
    this.listeners.set(channel, listeners)
    return () => { listeners.delete(listener) }
  }

  emit(channel: string, payload: unknown): void {
    for (const listener of this.listeners.get(channel) ?? []) listener(payload)
  }

  discover(sessionId: string): void {
    this.sessions.set(sessionId, { tree: restoredTree, aheadBehind: { ahead: 2, behind: 1 } })
    this.emit('files:tree-changed', { sessionId, rootPath: restoredTree.path })
  }

  install(): void {
    window.electronAPI = {
      invoke: this.invoke,
      on: this.on,
      send: vi.fn(),
      getPathForFile: vi.fn(),
    }
  }
}
