// src/main/plugins/plugin-storage-store.test.ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PluginStorageStore } from './plugin-storage-store'

let root: string

beforeEach(() => {
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
})
