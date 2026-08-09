// src/main/plugins/manifest.test.ts
import { describe, expect, it } from 'vitest'
import { parseManifest } from './manifest'
import { isCapability, isBuiltinOnlyCapability } from '../../shared/plugins/manifest'

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
  it('rejects ids that could escape the storage path (traversal/charset)', () => {
    expect(parseManifest({ ...valid, name: '../../../../tmp/pwned' }).ok).toBe(false)
    expect(parseManifest({ ...valid, publisher: '..' }).ok).toBe(false)
    expect(parseManifest({ ...valid, name: 'Has Spaces' }).ok).toBe(false)
    expect(parseManifest({ ...valid, name: 'evil/slash' }).ok).toBe(false)
  })
  it('rejects malformed view contributions', () => {
    expect(parseManifest({ ...valid, contributes: { views: 'x' } }).ok).toBe(false)
    expect(parseManifest({ ...valid, contributes: { views: [{ id: 'a' }] } }).ok).toBe(false)
  })
  it('accepts known capabilities and returns them typed', () => {
    const r = parseManifest({ ...valid, capabilities: ['storage', 'workspace:read', 'configuration'] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.capabilities).toEqual(['storage', 'workspace:read', 'configuration'])
  })
  it('accepts the new privileged capabilities (agent:control, lm)', () => {
    const r = parseManifest({ ...valid, capabilities: ['agent:control', 'lm'] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.capabilities).toEqual(['agent:control', 'lm'])
  })
  it('accepts the agent:spawn and transcription:read capabilities', () => {
    const r = parseManifest({ ...valid, capabilities: ['agent:spawn', 'transcription:read'] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.capabilities).toEqual(['agent:spawn', 'transcription:read'])
  })
  it('rejects an unknown capability (a typo must not silently grant nothing)', () => {
    expect(parseManifest({ ...valid, capabilities: ['storage', 'workspace'] }).ok).toBe(false)
    expect(parseManifest({ ...valid, capabilities: ['root'] }).ok).toBe(false)
  })
  it('rejects capabilities that are not an array', () => {
    expect(parseManifest({ ...valid, capabilities: 'storage' }).ok).toBe(false)
  })
  it('accepts view frameSources that are exact https origins', () => {
    const r = parseManifest({
      ...valid,
      contributes: { views: [{ id: 'v1', title: 'V', frameSources: ['https://www.youtube.com'] }] },
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.contributes?.views?.[0].frameSources).toEqual(['https://www.youtube.com'])
  })
  it.each([
    ['http origin', 'http://www.youtube.com'],
    ['path suffix', 'https://www.youtube.com/embed'],
    ['trailing slash', 'https://www.youtube.com/'],
    ['wildcard', 'https://*.youtube.com'],
    ['not a url', 'youtube.com'],
  ])('rejects frameSources entry: %s', (_label, src) => {
    const r = parseManifest({
      ...valid,
      contributes: { views: [{ id: 'v1', title: 'V', frameSources: [src] }] },
    })
    expect(r.ok).toBe(false)
  })
  it('rejects non-array frameSources', () => {
    const r = parseManifest({
      ...valid,
      contributes: { views: [{ id: 'v1', title: 'V', frameSources: 'https://www.youtube.com' }] },
    })
    expect(r.ok).toBe(false)
  })
  it('omits frameSources when not declared', () => {
    const r = parseManifest({ ...valid, contributes: { views: [{ id: 'v1', title: 'V' }] } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.contributes?.views?.[0].frameSources).toBeUndefined()
  })
  it('keeps a view icon the host ships a glyph for', () => {
    const r = parseManifest({ ...valid, contributes: { views: [{ id: 'v1', title: 'V', icon: 'chart' }] } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.contributes?.views?.[0].icon).toBe('chart')
  })
  // Dropped, not rejected: a plugin built against a newer host still loads here,
  // and the rail falls back to the generic plugin glyph.
  it('drops an unrecognised view icon without failing the manifest', () => {
    const r = parseManifest({ ...valid, contributes: { views: [{ id: 'v1', title: 'V', icon: 'rocket' }] } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.contributes?.views?.[0].icon).toBeUndefined()
  })
  it('omits the view icon when not declared', () => {
    const r = parseManifest({ ...valid, contributes: { views: [{ id: 'v1', title: 'V' }] } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.contributes?.views?.[0].icon).toBeUndefined()
  })
  it('does not pass raw unvalidated fields through (no `as unknown as`)', () => {
    // A non-string `main` must not survive as a typed string; it is coerced to undefined.
    const r = parseManifest({ ...valid, main: 42 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.main).toBeUndefined()
    // An arbitrary extra field on the raw input must not appear on the parsed manifest.
    const r2 = parseManifest({ ...valid, bogusField: 'x' }) as { ok: boolean; manifest: Record<string, unknown> }
    if (r2.ok) expect('bogusField' in r2.manifest).toBe(false)
  })
})

describe('capabilities', () => {
  it('recognizes the new privileged capabilities', () => {
    expect(isCapability('agent:control')).toBe(true)
    expect(isCapability('lm')).toBe(true)
    expect(isCapability('storage')).toBe(true)
    expect(isCapability('not-a-cap')).toBe(false)
  })
  it('marks agent:control and lm as builtin-only', () => {
    expect(isBuiltinOnlyCapability('agent:control')).toBe(true)
    expect(isBuiltinOnlyCapability('lm')).toBe(true)
    expect(isBuiltinOnlyCapability('storage')).toBe(false)
    expect(isBuiltinOnlyCapability('workspace:read')).toBe(false)
  })
})
