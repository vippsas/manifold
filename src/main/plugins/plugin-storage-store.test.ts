// src/main/plugins/plugin-storage-store.test.ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginStorageStore } from './plugin-storage-store'
import { debugLog } from '../app/debug-log'

vi.mock('../app/debug-log', () => ({
  debugLog: vi.fn(),
}))

let root: string

beforeEach(() => {
  vi.mocked(debugLog).mockClear()
  root = mkdtempSync(join(tmpdir(), 'plugin-storage-test-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('PluginStorageStore', () => {
  it('round-trips update + get', () => {
    const store = new PluginStorageStore(root)
    store.update('my.plugin', 'count', 42)
    expect(store.get('my.plugin', 'count')).toBe(42)
  })

  it('returns undefined for a missing key', () => {
    const store = new PluginStorageStore(root)
    expect(store.get('my.plugin', 'nonexistent')).toBeUndefined()
  })

  it('deletes a key when update is called with undefined', () => {
    const store = new PluginStorageStore(root)
    store.update('my.plugin', 'key', 'value')
    store.update('my.plugin', 'key', undefined)
    expect(store.get('my.plugin', 'key')).toBeUndefined()
  })

  it('persists values across new instances on the same root', () => {
    const store1 = new PluginStorageStore(root)
    store1.update('my.plugin', 'persisted', 'hello')

    const store2 = new PluginStorageStore(root)
    expect(store2.get('my.plugin', 'persisted')).toBe('hello')
  })

  describe('corrupt storage file', () => {
    function writeCorrupt(pluginId: string, raw: string): string {
      const dir = join(root, 'plugin-storage')
      mkdirSync(dir, { recursive: true })
      const file = join(dir, `${pluginId}.json`)
      writeFileSync(file, raw)
      return file
    }

    it('logs the corrupt file path via debugLog when read fails to parse', () => {
      const file = writeCorrupt('my.plugin', '{ not valid json ::')
      const store = new PluginStorageStore(root)

      store.get('my.plugin', 'count')

      expect(debugLog).toHaveBeenCalledTimes(1)
      const msg = vi.mocked(debugLog).mock.calls[0][0]
      expect(msg).toContain(file)
    })

    it('backs up the original corrupt bytes to a sibling .bak file', () => {
      const raw = '{ not valid json ::'
      const file = writeCorrupt('my.plugin', raw)
      const store = new PluginStorageStore(root)

      store.get('my.plugin', 'count')

      const bak = `${file}.bak`
      expect(readFileSync(bak, 'utf8')).toBe(raw)
    })

    it('preserves the original .bak and does not clobber it on repeated reads', () => {
      const raw = '{ first corrupt ::'
      const file = writeCorrupt('my.plugin', raw)
      const bak = `${file}.bak`
      const store = new PluginStorageStore(root)

      // First read creates the backup.
      store.get('my.plugin', 'count')
      expect(readFileSync(bak, 'utf8')).toBe(raw)

      // Overwrite the corrupt file with different corrupt bytes, then read again.
      writeFileSync(file, '{ second corrupt ::')
      store.get('my.plugin', 'count')

      // The original .bak must still hold the first corrupt bytes.
      expect(readFileSync(bak, 'utf8')).toBe(raw)
    })

    it('still returns the default/empty value for a corrupt file (contract preserved)', () => {
      writeCorrupt('my.plugin', '{ not valid json ::')
      const store = new PluginStorageStore(root)

      expect(store.get('my.plugin', 'count')).toBeUndefined()
    })
  })
})
