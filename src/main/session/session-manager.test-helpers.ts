import { vi } from 'vitest'
import type { WorktreeManager } from '../git/worktree-manager'
import type { PtyPool } from '../agent/pty-pool'
import type { ProjectRegistry } from '../store/project-registry'
import type { BrowserWindow } from 'electron'

export function createMockWorktreeManager() {
  return {
    createWorktree: vi.fn().mockResolvedValue({
      branch: 'manifold/oslo',
      path: '/repo/.manifold/worktrees/manifold-oslo',
    }),
    removeWorktree: vi.fn().mockResolvedValue(undefined),
    listWorktrees: vi.fn().mockResolvedValue([]),
  } as unknown as WorktreeManager
}

export function createMockPtyPool() {
  return {
    spawn: vi.fn().mockReturnValue({ id: 'pty-1', pid: 999 }),
    write: vi.fn(),
    kill: vi.fn(),
    resize: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
    killAll: vi.fn(),
    getActivePtyIds: vi.fn().mockReturnValue([]),
  } as unknown as PtyPool
}

export function createMockProjectRegistry() {
  return {
    getProject: vi.fn((id: string) => {
      if (id === 'proj-1') {
        return { id: 'proj-1', name: 'test', path: '/repo', baseBranch: 'main', addedAt: '2024-01-01' }
      }
      return undefined
    }),
    listProjects: vi.fn().mockReturnValue([]),
    addProject: vi.fn(),
    removeProject: vi.fn(),
  } as unknown as ProjectRegistry
}

export function createMockWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn(),
    },
  } as unknown as BrowserWindow
}
