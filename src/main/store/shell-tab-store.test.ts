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
import { ShellTabStore } from './shell-tab-store'

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockWriteFileSync = vi.mocked(fs.writeFileSync)
const mockMkdirSync = vi.mocked(fs.mkdirSync)

describe('ShellTabStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor / loadFromDisk', () => {
    it('returns null when file does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ShellTabStore()
      expect(store.get('/some/path')).toBeNull()
    })

    it('loads existing state from disk', () => {
      const state = {
        '/worktree/oslo': {
          tabs: [{ label: 'Shell 3', cwd: '/worktree/oslo' }],
          counter: 4,
        },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(state))

      const store = new ShellTabStore()
      expect(store.get('/worktree/oslo')).toEqual(state['/worktree/oslo'])
    })

    it('returns null when file contains invalid JSON', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('not json!')
      const store = new ShellTabStore()
      expect(store.get('/any')).toBeNull()
    })

    it('returns null when readFileSync throws', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES')
      })
      const store = new ShellTabStore()
      expect(store.get('/any')).toBeNull()
    })

    it('drops malformed-but-valid-JSON entries on load and keeps good ones (#532)', () => {
      const onDisk = {
        good: { tabs: [{ label: 'Shell 1', cwd: '/wt' }], counter: 2 },
        // tabs is an object, not an array — would throw on get()'s tabs.map(...).
        badTabs: { tabs: { nope: true }, counter: 1 },
        // counter missing/wrong type.
        badCounter: { tabs: [], counter: 'two' },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(onDisk))

      const store = new ShellTabStore()
      expect(store.get('good')?.counter).toBe(2)
      expect(store.get('badTabs')).toBeNull()
      expect(store.get('badCounter')).toBeNull()
    })
  })

  describe('get', () => {
    it('returns null for unknown key', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ShellTabStore()
      expect(store.get('unknown')).toBeNull()
    })

    it('returns a copy not the same reference', () => {
      const state = {
        '/path': { tabs: [{ label: 'Shell 3', cwd: '/path' }], counter: 4 },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(state))

      const store = new ShellTabStore()
      const a = store.get('/path')
      const b = store.get('/path')
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })
  })

  describe('set', () => {
    it('saves state and writes to disk', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ShellTabStore()

      store.set('/path', {
        tabs: [{ label: 'Shell 3', cwd: '/path' }],
        counter: 4,
      })

      expect(store.get('/path')).toEqual({
        tabs: [{ label: 'Shell 3', cwd: '/path' }],
        counter: 4,
      })
      expect(mockMkdirSync).toHaveBeenCalled()
      expect(mockWriteFileSync).toHaveBeenCalledOnce()
    })

    it('overwrites existing state for same key', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ShellTabStore()

      store.set('/path', {
        tabs: [{ label: 'Shell 1', cwd: '/path' }],
        counter: 2,
      })

      store.set('/path', {
        tabs: [{ label: 'Shell 5', cwd: '/path' }],
        counter: 6,
      })

      expect(store.get('/path')).toEqual({
        tabs: [{ label: 'Shell 5', cwd: '/path' }],
        counter: 6,
      })
    })
  })

  describe('delete', () => {
    it('removes state and writes to disk', () => {
      const state = {
        '/path': { tabs: [{ label: 'Shell 3', cwd: '/path' }], counter: 4 },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(state))

      const store = new ShellTabStore()
      store.delete('/path')
      expect(store.get('/path')).toBeNull()
      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('is a no-op for unknown key (still writes)', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ShellTabStore()
      store.delete('unknown')
      expect(store.get('unknown')).toBeNull()
    })
  })
})
