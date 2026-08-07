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
import { DockLayoutStore } from './dock-layout-store'

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockWriteFileSync = vi.mocked(fs.writeFileSync)
const mockRenameSync = vi.mocked(fs.renameSync)

const STATE_FILE = '/mock-home/.manifold/dock-layout.json'

describe('DockLayoutStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const layout = { grid: { root: {} }, panels: { agent: {} } }

  it('round-trips the one layout', () => {
    mockExistsSync.mockReturnValue(false)
    const store = new DockLayoutStore()
    store.set(layout)
    expect(store.get()).toEqual(layout)
    // Written bare, not wrapped in a keyed map.
    const lastWrite = mockWriteFileSync.mock.calls.at(-1)![1] as string
    expect(JSON.parse(lastWrite)).toEqual(layout)
  })

  it('loads the saved layout from disk', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(layout))
    expect(new DockLayoutStore().get()).toEqual(layout)
  })

  it('returns null when nothing is saved', () => {
    mockExistsSync.mockReturnValue(false)
    expect(new DockLayoutStore().get()).toBeNull()
  })

  it('drops a per-agent map written before the layout became window-scoped', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ 's1': layout, 's2': layout }))
    // No single layout to pick out of the map — the default is rebuilt instead.
    expect(new DockLayoutStore().get()).toBeNull()
  })

  it('writes atomically via a tmp file + rename (#525)', () => {
    mockExistsSync.mockReturnValue(false)
    const store = new DockLayoutStore()
    store.set(layout)

    // writeFileSync targets the .tmp sibling; rename moves it over the real file.
    expect(mockWriteFileSync).toHaveBeenCalledWith(`${STATE_FILE}.tmp`, expect.any(String), 'utf-8')
    expect(mockRenameSync).toHaveBeenCalledWith(`${STATE_FILE}.tmp`, STATE_FILE)
  })
})
