import { describe, expect, it } from 'vitest'
import { parseVscodeManifest } from './vscode-manifest'

const valid = {
  name: 'vscode-demo', publisher: 'ms-azuretools', version: '1.2.3',
  displayName: 'Demo', engines: { vscode: '^1.104.0' },
  main: './out/extension.js',
  activationEvents: ['onCommand:demo.hello'],
  contributes: { commands: [{ command: 'demo.hello', title: 'Demo: Hello' }] },
}

describe('parseVscodeManifest', () => {
  it('accepts a valid VS Code manifest and maps it to the Manifold shape', () => {
    const r = parseVscodeManifest(valid)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.manifest.engines.vscode).toBe('^1.104.0')
      expect(r.manifest.main).toBe('./out/extension.js')
      expect(r.manifest.contributes?.commands?.[0]).toEqual({ command: 'demo.hello', title: 'Demo: Hello' })
    }
  })
  it('requires name/publisher/version and engines.vscode', () => {
    expect(parseVscodeManifest({ ...valid, name: undefined }).ok).toBe(false)
    expect(parseVscodeManifest({ ...valid, publisher: undefined }).ok).toBe(false)
    expect(parseVscodeManifest({ ...valid, version: undefined }).ok).toBe(false)
    expect(parseVscodeManifest({ ...valid, engines: {} }).ok).toBe(false)
  })
  it('accepts mixed-case publisher/name (VS Code allows it) but rejects path-unsafe ids', () => {
    expect(parseVscodeManifest({ ...valid, publisher: 'GitHub', name: 'copilot' }).ok).toBe(true)
    expect(parseVscodeManifest({ ...valid, name: '../escape' }).ok).toBe(false)
    expect(parseVscodeManifest({ ...valid, publisher: '..' }).ok).toBe(false)
    expect(parseVscodeManifest({ ...valid, name: 'has space' }).ok).toBe(false)
  })
  it('leaves contributes undefined when there are no commands', () => {
    const r = parseVscodeManifest({ ...valid, contributes: { commands: [] } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.contributes).toBeUndefined()
  })
  it('filters non-string activationEvents', () => {
    const r = parseVscodeManifest({ ...valid, activationEvents: ['onCommand:foo', 42, null] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.activationEvents).toEqual(['onCommand:foo'])
  })
  it('maps contributes.views (container keyed) to tree PluginViewContributions', () => {
    const r = parseVscodeManifest({
      ...valid,
      contributes: { views: { myContainer: [{ id: 'v1', name: 'View One' }] } },
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.manifest.contributes?.views).toEqual([
        { id: 'v1', title: 'View One', type: 'tree', launcher: true },
      ])
    }
  })
  it('includes both commands and views when both are present', () => {
    const r = parseVscodeManifest({
      ...valid,
      contributes: {
        commands: [{ command: 'demo.hello', title: 'Demo: Hello' }],
        views: { panel: [{ id: 'demo.view', name: 'Demo View' }] },
      },
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.manifest.contributes?.commands).toHaveLength(1)
      expect(r.manifest.contributes?.views).toHaveLength(1)
    }
  })
  it('ignores malformed or absent contributes.views gracefully', () => {
    const noViews = parseVscodeManifest({ ...valid, contributes: { commands: [{ command: 'x', title: 'X' }] } })
    expect(noViews.ok).toBe(true)
    if (noViews.ok) expect(noViews.manifest.contributes?.views).toBeUndefined()
    const arrayViews = parseVscodeManifest({ ...valid, contributes: { views: [{ id: 'x', name: 'X' }] } })
    expect(arrayViews.ok).toBe(true)
    if (arrayViews.ok) expect(arrayViews.manifest.contributes?.views).toBeUndefined()
  })
})
