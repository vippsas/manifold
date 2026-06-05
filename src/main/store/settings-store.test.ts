import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/defaults'

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

/** DEFAULT_SETTINGS has storagePath: '', but resolveDefaults() fills it in at runtime;
 *  it also seeds the default-disabled plugins once and sets the pluginDefaultsSeeded marker. */
const RESOLVED_DEFAULTS = {
  ...DEFAULT_SETTINGS,
  storagePath: '/mock-home/.manifold',
  pluginDefaultsSeeded: true,
}

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
      expect(store.getSettings()).toEqual(RESOLVED_DEFAULTS)
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
      expect(store.getSettings()).toEqual(RESOLVED_DEFAULTS)
    })

    it('returns defaults when file contains a non-object (e.g. number)', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('42')

      const store = new SettingsStore()
      expect(store.getSettings()).toEqual(RESOLVED_DEFAULTS)
    })

    it('returns defaults when file contains null', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('null')

      const store = new SettingsStore()
      expect(store.getSettings()).toEqual(RESOLVED_DEFAULTS)
    })

    it('returns defaults when readFileSync throws', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES')
      })

      const store = new SettingsStore()
      expect(store.getSettings()).toEqual(RESOLVED_DEFAULTS)
    })
  })

  describe('default-disabled plugin seeding', () => {
    const HELLO = ['manifold.hello', 'manifold.hello-tree', 'manifold.hello-vscode']

    it('seeds the default-disabled plugins into a pre-existing config that lacks the marker', () => {
      // A config written before this release: has disabledPlugins but no pluginDefaultsSeeded.
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ disabledPlugins: [] }))

      const store = new SettingsStore()
      const s = store.getSettings()
      expect(s.disabledPlugins).toEqual(expect.arrayContaining(HELLO))
      expect(s.pluginDefaultsSeeded).toBe(true)
    })

    it('preserves user-disabled ids while adding the defaults (no duplicates)', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ disabledPlugins: ['acme.custom', 'manifold.hello'] }))

      const store = new SettingsStore()
      const ids = store.getSettings().disabledPlugins ?? []
      expect(ids).toEqual(expect.arrayContaining([...HELLO, 'acme.custom']))
      expect(ids.filter((i) => i === 'manifold.hello')).toHaveLength(1)
    })

    it('does NOT re-disable a plugin the user already enabled (marker already set)', () => {
      // User previously enabled manifold.hello; the marker was persisted with that choice.
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({
        pluginDefaultsSeeded: true,
        disabledPlugins: ['manifold.hello-tree', 'manifold.hello-vscode'],
      }))

      const store = new SettingsStore()
      const ids = store.getSettings().disabledPlugins ?? []
      expect(ids).not.toContain('manifold.hello')
      expect(ids).toEqual(['manifold.hello-tree', 'manifold.hello-vscode'])
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

  describe('defaults', () => {
    it('includes uiMode in default settings', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new SettingsStore()
      const settings = store.getSettings()
      expect(settings.uiMode).toBe('developer')
    })

    it('deep-merges partial search AI settings with defaults', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({
        search: {
          ai: {
            enabled: false,
            mode: 'rerank',
          },
        },
      }))

      const store = new SettingsStore()
      const settings = store.getSettings()
      expect(settings.search?.ai.enabled).toBe(false)
      expect(settings.search?.ai.mode).toBe('rerank')
      expect(settings.search?.ai.runtimeId).toBe(DEFAULT_SETTINGS.search.ai.runtimeId)
      expect(settings.search?.ai.citationLimit).toBe(DEFAULT_SETTINGS.search.ai.citationLimit)
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
