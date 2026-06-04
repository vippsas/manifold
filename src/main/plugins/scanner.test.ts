// src/main/plugins/scanner.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanPluginDir } from './scanner'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'mf-plugins-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function plugin(name: string, manifest: unknown): void {
  const p = join(dir, name)
  mkdirSync(p, { recursive: true })
  writeFileSync(join(p, 'package.json'), JSON.stringify(manifest))
}

describe('scanPluginDir', () => {
  it('returns empty for a missing dir', () => {
    expect(scanPluginDir(join(dir, 'nope'), 'user')).toEqual({ plugins: [], errors: [] })
  })
  it('discovers a valid plugin and builds publisher.name id', () => {
    plugin('hello', { name: 'hello', publisher: 'manifold', version: '1.0.0', engines: { manifold: '^0.3.0' } })
    const r = scanPluginDir(dir, 'builtin')
    expect(r.plugins).toHaveLength(1)
    expect(r.plugins[0].id).toBe('manifold.hello')
    expect(r.plugins[0].origin).toBe('builtin')
  })
  it('records an error for invalid JSON and for invalid manifests, skipping them', () => {
    const bad = join(dir, 'bad'); mkdirSync(bad); writeFileSync(join(bad, 'package.json'), '{ not json')
    plugin('nomanifold', { name: 'x' }) // missing publisher/version/engines
    const r = scanPluginDir(dir, 'user')
    expect(r.plugins).toHaveLength(0)
    expect(r.errors).toHaveLength(2)
  })
  it('ignores directories without a package.json', () => {
    mkdirSync(join(dir, 'empty'))
    expect(scanPluginDir(dir, 'user').plugins).toHaveLength(0)
  })
})
