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

  it('round-trips an opaque layout', () => {
    mockExistsSync.mockReturnValue(false)
    const store = new DockLayoutStore()
    const layout = { panels: { a: 1 }, grid: [1, 2] }
    store.set('s1', layout)
    expect(store.get('s1')).toEqual(layout)
  })

  it('loads existing layouts from disk', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ s1: { foo: 'bar' } }))
    const store = new DockLayoutStore()
    expect(store.get('s1')).toEqual({ foo: 'bar' })
  })

  it('returns null for an unknown session', () => {
    mockExistsSync.mockReturnValue(false)
    const store = new DockLayoutStore()
    expect(store.get('missing')).toBeNull()
  })

  it('delete removes the layout and persists (so the file shrinks) (#524)', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ s1: { foo: 1 }, s2: { bar: 2 } }))
    const store = new DockLayoutStore()

    store.delete('s1')

    expect(store.get('s1')).toBeNull()
    expect(store.get('s2')).toEqual({ bar: 2 })
    // The persisted object no longer contains the deleted session.
    const lastWrite = mockWriteFileSync.mock.calls.at(-1)![1] as string
    expect(JSON.parse(lastWrite)).toEqual({ s2: { bar: 2 } })
  })

  it('writes atomically via a tmp file + rename (#525)', () => {
    mockExistsSync.mockReturnValue(false)
    const store = new DockLayoutStore()
    store.set('s1', { x: 1 })

    // writeFileSync targets the .tmp sibling; rename moves it over the real file.
    expect(mockWriteFileSync).toHaveBeenCalledWith(`${STATE_FILE}.tmp`, expect.any(String), 'utf-8')
    expect(mockRenameSync).toHaveBeenCalledWith(`${STATE_FILE}.tmp`, STATE_FILE)
  })
})
