import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/defaults'

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
import { SettingsStore } from './settings-store'

/** DEFAULT_SETTINGS has storagePath: '', but resolveDefaults() fills it in at runtime;
 *  it also seeds the default-disabled plugins and records the ids it seeded. */
const RESOLVED_DEFAULTS = {
  ...DEFAULT_SETTINGS,
  storagePath: '/mock-home/.manifold',
  seededDisabledPlugins: [...DEFAULT_SETTINGS.disabledPlugins],
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

    it('opens a first launch on Manifold Dark', () => {
      mockExistsSync.mockReturnValue(false)
      expect(new SettingsStore().getSettings().theme).toBe('manifold-dark')
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
    const DEFAULT_DISABLED = DEFAULT_SETTINGS.disabledPlugins

    it('seeds the default-disabled plugins into a pre-existing config that has none seeded', () => {
      // A config written before this release: has disabledPlugins but no seeded record.
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ disabledPlugins: [] }))

      const store = new SettingsStore()
      const s = store.getSettings()
      expect(s.disabledPlugins).toEqual(expect.arrayContaining(DEFAULT_DISABLED))
      expect(s.seededDisabledPlugins).toEqual(expect.arrayContaining(DEFAULT_DISABLED))
    })

    it('preserves user-disabled ids while adding the defaults (no duplicates)', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ disabledPlugins: ['acme.custom', ...DEFAULT_DISABLED] }))

      const store = new SettingsStore()
      const ids = store.getSettings().disabledPlugins ?? []
      expect(ids).toEqual(expect.arrayContaining([...DEFAULT_DISABLED, 'acme.custom']))
      for (const id of DEFAULT_DISABLED) expect(ids.filter((i) => i === id)).toHaveLength(1)
    })

    it('does NOT re-disable a plugin the user already enabled (id already seeded)', () => {
      // User previously enabled a default-disabled plugin; the id stays recorded as seeded.
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({
        seededDisabledPlugins: DEFAULT_DISABLED,
        disabledPlugins: ['acme.custom'],
      }))

      const store = new SettingsStore()
      const ids = store.getSettings().disabledPlugins ?? []
      expect(ids).toEqual(['acme.custom'])
    })

    it('seeds an id that became default-disabled after the config was written', () => {
      // Ids seeded by an older release must not freeze the set: a new default still applies.
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({
        seededDisabledPlugins: ['legacy.sample'],
        disabledPlugins: ['legacy.sample'],
      }))

      const store = new SettingsStore()
      const s = store.getSettings()
      expect(s.disabledPlugins).toEqual(expect.arrayContaining(DEFAULT_DISABLED))
      expect(s.seededDisabledPlugins).toEqual(['legacy.sample', ...DEFAULT_DISABLED])
    })

    it('drops the orphaned pluginDefaultsSeeded flag written by older builds', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ pluginDefaultsSeeded: true, disabledPlugins: [] }))

      const store = new SettingsStore()
      expect((store.getSettings() as Record<string, unknown>).pluginDefaultsSeeded).toBeUndefined()
    })
  })

  describe('provisioning removal', () => {
    it('drops the orphaned provisioning field left by older builds', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ provisioning: { provisioners: [{ id: 'legacy-cli', type: 'cli' }] } }))

      const store = new SettingsStore()
      expect((store.getSettings() as Record<string, unknown>).provisioning).toBeUndefined()
    })

    it('does not re-persist provisioning on the next write', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ provisioning: { provisioners: [] } }))

      const store = new SettingsStore()
      store.updateSettings({ theme: 'light' })

      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
      expect(written.provisioning).toBeUndefined()
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

    it('fills in default editor settings when absent', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new SettingsStore()
      expect(store.getSettings().editor).toEqual(DEFAULT_SETTINGS.editor)
    })

    it('enables word wrap and the minimap by default for a fresh install', () => {
      mockExistsSync.mockReturnValue(false)
      const editor = new SettingsStore().getSettings().editor
      expect(editor?.wordWrap).toBe('on')
      expect(editor?.minimap).toBe(true)
      expect(editor?.markdownWordWrap).toBe(true)
    })

    it('deep-merges partial editor settings with defaults', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ editor: { fontSize: 16 } }))

      const store = new SettingsStore()
      const editor = store.getSettings().editor
      expect(editor?.fontSize).toBe(16)
      expect(editor?.fontFamily).toBe(DEFAULT_SETTINGS.editor?.fontFamily)
      expect(editor?.wordWrap).toBe(DEFAULT_SETTINGS.editor?.wordWrap)
      expect(editor?.markdownWordWrap).toBe(true)
      expect(editor?.minimap).toBe(DEFAULT_SETTINGS.editor?.minimap)
      expect(editor?.tabSize).toBe(DEFAULT_SETTINGS.editor?.tabSize)
    })

    it('fills in default notification settings when absent', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new SettingsStore()
      expect(store.getSettings().notifications).toEqual(DEFAULT_SETTINGS.notifications)
    })

    it('deep-merges partial notification settings with defaults', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ notifications: { onWaiting: false } }))

      const store = new SettingsStore()
      const n = store.getSettings().notifications
      expect(n?.onWaiting).toBe(false)
      expect(n?.enabled).toBe(DEFAULT_SETTINGS.notifications?.enabled)
      expect(n?.onDone).toBe(DEFAULT_SETTINGS.notifications?.onDone)
      expect(n?.onError).toBe(DEFAULT_SETTINGS.notifications?.onError)
      expect(n?.scope).toBe(DEFAULT_SETTINGS.notifications?.scope)
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
