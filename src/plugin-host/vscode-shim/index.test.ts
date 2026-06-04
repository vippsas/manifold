import { describe, expect, it, vi } from 'vitest'
import { createVscodeShim } from './index'
import { Disposable, EventEmitter, Uri } from './types'

function deps() {
  return {
    commands: {
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
      executeCommand: vi.fn().mockResolvedValue(undefined),
    },
    messagesProxy: { $showMessage: vi.fn().mockResolvedValue(undefined) },
    configProxy: { $get: vi.fn().mockResolvedValue(undefined) },
    storageProxy: { $get: vi.fn().mockResolvedValue(undefined), $update: vi.fn().mockResolvedValue(undefined) },
    pluginId: 'pub.ext',
    extensionPath: '/ext',
  }
}

describe('createVscodeShim', () => {
  it('exposes commands, window, workspace, the value types, and a context factory', () => {
    const { vscode } = createVscodeShim(deps() as never)
    expect(typeof (vscode.commands as { registerCommand: unknown }).registerCommand).toBe('function')
    expect(typeof (vscode.window as { showInformationMessage: unknown }).showInformationMessage).toBe('function')
    expect(typeof (vscode.workspace as { getConfiguration: unknown }).getConfiguration).toBe('function')
    expect(vscode.Disposable).toBe(Disposable)
    expect(vscode.EventEmitter).toBe(EventEmitter)
    expect(vscode.Uri).toBe(Uri)
    expect((vscode.ViewColumn as { One: number }).One).toBe(1)
  })

  it('createContext builds an ExtensionContext bound to the plugin id', async () => {
    const d = deps()
    const { createContext } = createVscodeShim(d as never)
    const ctx = createContext()
    await ctx.globalState.update('k', 1)
    expect(d.storageProxy.$update).toHaveBeenCalledWith('pub.ext', 'global:k', 1)
  })
})
