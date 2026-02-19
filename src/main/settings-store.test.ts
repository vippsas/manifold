import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/types'

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
import { SettingsStore } from './settings-store'

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockWriteFileSync = vi.mocked(fs.writeFileSync)
const mockMkdirSync = vi.mocked(fs.mkdirSync)

describe('SettingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor / loadFromDisk', () => {
    it('returns defaults when config file does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new SettingsStore()
      expect(store.getSettings()).toEqual(DEFAULT_SETTINGS)
    })

    it('reads and merges settings from disk', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ theme: 'light' }))

      const store = new SettingsStore()
      const settings = store.getSettings()
      expect(settings.theme).toBe('light')
      expect(settings.defaultRuntime).toBe(DEFAULT_SETTINGS.defaultRuntime)
      expect(settings.scrollbackLines).toBe(DEFAULT_SETTINGS.scrollbackLines)
    })

    it('returns defaults when file contains invalid JSON', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('not json!')

      const store = new SettingsStore()
      expect(store.getSettings()).toEqual(DEFAULT_SETTINGS)
    })

    it('returns defaults when file contains a non-object (e.g. number)', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('42')

      const store = new SettingsStore()
      expect(store.getSettings()).toEqual(DEFAULT_SETTINGS)
    })

    it('returns defaults when file contains null', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('null')

      const store = new SettingsStore()
      expect(store.getSettings()).toEqual(DEFAULT_SETTINGS)
    })

    it('returns defaults when readFileSync throws', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES')
      })

      const store = new SettingsStore()
      expect(store.getSettings()).toEqual(DEFAULT_SETTINGS)
    })
  })

  describe('getSettings', () => {
    it('returns a copy (not the same reference)', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new SettingsStore()
      const a = store.getSettings()
      const b = store.getSettings()
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })
  })

  describe('updateSettings', () => {
    it('merges partial updates and persists to disk', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new SettingsStore()

      const result = store.updateSettings({ theme: 'light', scrollbackLines: 10000 })
      expect(result.theme).toBe('light')
      expect(result.scrollbackLines).toBe(10000)
      expect(result.defaultRuntime).toBe(DEFAULT_SETTINGS.defaultRuntime)

      // Verify it wrote to disk
      expect(mockMkdirSync).toHaveBeenCalled()
      expect(mockWriteFileSync).toHaveBeenCalledOnce()
      const writtenData = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
      expect(writtenData.theme).toBe('light')
      expect(writtenData.scrollbackLines).toBe(10000)
    })

    it('returns a copy from updateSettings', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new SettingsStore()

      const result = store.updateSettings({ theme: 'light' })
      result.theme = 'dark' as 'dark' | 'light'

      // Should not affect the internal state
      expect(store.getSettings().theme).toBe('light')
    })

    it('accumulates multiple updates', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new SettingsStore()

      store.updateSettings({ theme: 'light' })
      store.updateSettings({ scrollbackLines: 999 })

      const settings = store.getSettings()
      expect(settings.theme).toBe('light')
      expect(settings.scrollbackLines).toBe(999)
    })
  })
})
