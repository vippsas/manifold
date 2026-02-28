import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
}))

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}))

import * as fs from 'node:fs'
import { ViewStateStore } from './view-state-store'

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockWriteFileSync = vi.mocked(fs.writeFileSync)
const mockMkdirSync = vi.mocked(fs.mkdirSync)

describe('ViewStateStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor / loadFromDisk', () => {
    it('returns empty map when file does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ViewStateStore()
      expect(store.get('nonexistent')).toBeNull()
    })

    it('loads existing state from disk', () => {
      const state = {
        'session-1': {
          openFilePaths: ['src/main.ts'],
          activeFilePath: 'src/main.ts',

          expandedPaths: ['/worktree/src'],
        },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(state))

      const store = new ViewStateStore()
      expect(store.get('session-1')).toEqual(state['session-1'])
    })

    it('returns empty map when file contains invalid JSON', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('not json!')

      const store = new ViewStateStore()
      expect(store.get('any')).toBeNull()
    })

    it('returns empty map when readFileSync throws', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES')
      })

      const store = new ViewStateStore()
      expect(store.get('any')).toBeNull()
    })
  })

  describe('get', () => {
    it('returns null for unknown session', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ViewStateStore()
      expect(store.get('unknown')).toBeNull()
    })

    it('returns a copy (not the same reference)', () => {
      const state = {
        'session-1': {
          openFilePaths: ['a.ts'],
          activeFilePath: 'a.ts',

          expandedPaths: ['/src'],
        },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(state))

      const store = new ViewStateStore()
      const a = store.get('session-1')
      const b = store.get('session-1')
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })
  })

  describe('set', () => {
    it('saves state and writes to disk', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ViewStateStore()

      const viewState = {
        openFilePaths: ['src/index.ts'],
        activeFilePath: 'src/index.ts',

        expandedPaths: ['/worktree/src'],
      }

      store.set('session-1', viewState)
      expect(store.get('session-1')).toEqual(viewState)
      expect(mockMkdirSync).toHaveBeenCalled()
      expect(mockWriteFileSync).toHaveBeenCalledOnce()
    })

    it('overwrites existing state for same session', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ViewStateStore()

      store.set('session-1', {
        openFilePaths: ['a.ts'],
        activeFilePath: 'a.ts',
        expandedPaths: [],
      })

      store.set('session-1', {
        openFilePaths: ['b.ts'],
        activeFilePath: 'b.ts',
        expandedPaths: ['/src'],
      })

      expect(store.get('session-1')?.openFilePaths).toEqual(['b.ts'])
    })
  })

  describe('delete', () => {
    it('removes state for a session and writes to disk', () => {
      const state = {
        'session-1': {
          openFilePaths: ['a.ts'],
          activeFilePath: 'a.ts',

          expandedPaths: [],
        },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(state))

      const store = new ViewStateStore()
      store.delete('session-1')

      expect(store.get('session-1')).toBeNull()
      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('is a no-op for unknown session (still writes)', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ViewStateStore()
      store.delete('unknown')
      expect(store.get('unknown')).toBeNull()
    })
  })
})
