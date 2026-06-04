// src/main/plugins/manifest.test.ts
import { describe, expect, it } from 'vitest'
import { parseManifest } from './manifest'

const valid = {
  name: 'hello', publisher: 'manifold', version: '0.0.1',
  engines: { manifold: '^0.3.0' },
  contributes: { views: [{ id: 'manifold.hello.panel', title: 'Hello' }] },
}

describe('parseManifest', () => {
  it('accepts a valid manifest', () => {
    const r = parseManifest(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.name).toBe('hello')
  })
  it('rejects a non-object', () => {
    expect(parseManifest(null).ok).toBe(false)
    expect(parseManifest('x').ok).toBe(false)
  })
  it('requires name/publisher/version', () => {
    expect(parseManifest({ ...valid, name: undefined }).ok).toBe(false)
    expect(parseManifest({ ...valid, version: '' }).ok).toBe(false)
  })
  it('requires engines.manifold', () => {
    expect(parseManifest({ ...valid, engines: {} }).ok).toBe(false)
  })
  it('rejects malformed view contributions', () => {
    expect(parseManifest({ ...valid, contributes: { views: 'x' } }).ok).toBe(false)
    expect(parseManifest({ ...valid, contributes: { views: [{ id: 'a' }] } }).ok).toBe(false)
  })
})
