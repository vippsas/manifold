import { describe, expect, it } from 'vitest'
import { resolvePluginModule, registerPluginApis, unregisterPluginApis } from './require-interceptor'

describe('per-module plugin require resolution', () => {
  it('resolves manifold/vscode for files under a registered plugin root', () => {
    const manifold = { tag: 'manifold-A' }
    const vscode = { tag: 'vscode-A' }
    registerPluginApis('/plugins/a', { manifold, vscode })
    expect(resolvePluginModule('manifold', '/plugins/a/out/main.js')).toBe(manifold)
    expect(resolvePluginModule('vscode', '/plugins/a/out/main.js')).toBe(vscode)
    unregisterPluginApis('/plugins/a')
    expect(resolvePluginModule('manifold', '/plugins/a/out/main.js')).toBeUndefined()
  })

  it('does not cross-resolve between two plugins', () => {
    registerPluginApis('/plugins/a', { vscode: { tag: 'A' } })
    registerPluginApis('/plugins/b', { vscode: { tag: 'B' } })
    expect((resolvePluginModule('vscode', '/plugins/a/x.js') as { tag: string }).tag).toBe('A')
    expect((resolvePluginModule('vscode', '/plugins/b/x.js') as { tag: string }).tag).toBe('B')
    expect(resolvePluginModule('vscode', '/elsewhere/x.js')).toBeUndefined()
    unregisterPluginApis('/plugins/a'); unregisterPluginApis('/plugins/b')
  })
})
