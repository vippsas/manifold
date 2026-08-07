import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
}))

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}))

import * as fs from 'node:fs'
import { ipcMain } from 'electron'
import { ActiveWorkspaceStore } from './active-workspace-store'
import { registerWorkspaceHandlers } from '../ipc/workspace-handlers'
import type { IpcDependencies } from '../ipc/types'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockWriteFileSync = vi.mocked(fs.writeFileSync)
const mockRenameSync = vi.mocked(fs.renameSync)

const STATE_FILE = '/mock-home/.manifold/active-workspace.json'

describe('ActiveWorkspaceStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('round-trips the active workspace id', () => {
    mockExistsSync.mockReturnValue(false)
    const store = new ActiveWorkspaceStore()
    store.set('w1')
    expect(store.get()).toBe('w1')
    const lastWrite = mockWriteFileSync.mock.calls.at(-1)![1] as string
    expect(JSON.parse(lastWrite)).toEqual({ workspaceId: 'w1' })
  })

  it('loads the saved id from disk', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ workspaceId: 'w1' }))
    expect(new ActiveWorkspaceStore().get()).toBe('w1')
  })

  it('returns null when nothing is saved', () => {
    mockExistsSync.mockReturnValue(false)
    expect(new ActiveWorkspaceStore().get()).toBeNull()
  })

  it('returns null for a malformed file', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('not json')
    expect(new ActiveWorkspaceStore().get()).toBeNull()
  })

  it('clears the saved id', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ workspaceId: 'w1' }))
    const store = new ActiveWorkspaceStore()
    store.set(null)
    expect(store.get()).toBeNull()
  })

  it('writes atomically via a tmp file + rename', () => {
    mockExistsSync.mockReturnValue(false)
    new ActiveWorkspaceStore().set('w1')
    expect(mockWriteFileSync).toHaveBeenCalledWith(`${STATE_FILE}.tmp`, expect.any(String), 'utf-8')
    expect(mockRenameSync).toHaveBeenCalledWith(`${STATE_FILE}.tmp`, STATE_FILE)
  })
})

describe('workspace active handlers', () => {
  it('exposes get/set over IPC', () => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(false)
    const activeWorkspaceStore = new ActiveWorkspaceStore()
    registerWorkspaceHandlers({
      workspaceManager: {},
      activeWorkspaceStore,
    } as unknown as IpcDependencies)

    const handlers = new Map(vi.mocked(ipcMain.handle).mock.calls.map(([c, fn]) => [c, fn]))
    handlers.get('workspace:set-active')!({} as never, 'w1')
    expect(handlers.get('workspace:get-active')!({} as never)).toBe('w1')
  })
})
