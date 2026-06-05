import { describe, expect, it, vi } from 'vitest'
import { createVscodeShim, type VscodeShimDeps } from './index'
import { Disposable, EventEmitter, Uri } from './types'

function deps(): VscodeShimDeps {
  return {
    commands: {
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
      executeCommand: vi.fn().mockResolvedValue(undefined),
    },
    messagesProxy: { $showMessage: vi.fn().mockResolvedValue(undefined) },
    configProxy: { $get: vi.fn().mockResolvedValue(undefined) },
    storageProxy: { $get: vi.fn().mockResolvedValue(undefined), $update: vi.fn().mockResolvedValue(undefined) },
    windowApi: {
      registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
      registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
      createTreeView: vi.fn(() => ({ dispose: vi.fn() })),
    },
    pluginId: 'pub.ext',
    extensionPath: '/ext',
  }
}

describe('createVscodeShim', () => {
  it('exposes commands, window, workspace, the value types, and a context factory', () => {
    const { vscode } = createVscodeShim(deps())
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
    const { createContext } = createVscodeShim(d)
    const ctx = createContext()
    await ctx.globalState.update('k', 1)
    expect(d.storageProxy.$update).toHaveBeenCalledWith('pub.ext', 'global:k', 1)
  })

  it('wires window to messagesProxy', async () => {
    const d = deps()
    const { vscode } = createVscodeShim(d)
    await (vscode.window as { showInformationMessage(m: string): Promise<unknown> }).showInformationMessage('hi')
    expect(d.messagesProxy.$showMessage).toHaveBeenCalledWith('info', 'hi', [])
  })

  it('wires workspace to configProxy', async () => {
    const d = deps()
    vi.mocked(d.configProxy.$get).mockResolvedValue('val')
    const { vscode } = createVscodeShim(d)
    const cfg = (vscode.workspace as { getConfiguration(s: string): { get(k: string): Promise<unknown> } }).getConfiguration('x')
    expect(await cfg.get('y')).toBe('val')
    expect(d.configProxy.$get).toHaveBeenCalledWith('pub.ext', 'x.y')
  })

  it('wires registerWebviewViewProvider to the real windowApi', () => {
    const d = deps()
    const { vscode } = createVscodeShim(d)
    const provider = { resolveWebviewView() {} }
    ;(vscode.window as { registerWebviewViewProvider(id: string, p: unknown): unknown }).registerWebviewViewProvider('v.id', provider)
    expect(d.windowApi.registerWebviewViewProvider).toHaveBeenCalledWith('v.id', provider)
  })

  it('createWebviewPanel still throws (stays notImplemented)', () => {
    const { vscode } = createVscodeShim(deps())
    expect(() =>
      (vscode.window as { createWebviewPanel(...args: unknown[]): unknown }).createWebviewPanel('t', 'T', 1, {})
    ).toThrow()
  })

  it('wires createTreeView to the real windowApi', () => {
    const d = deps()
    const { vscode } = createVscodeShim(d)
    const treeDataProvider = { getChildren: () => [], getTreeItem: () => ({ label: 'x' }) }
    ;(vscode.window as { createTreeView(id: string, opts: unknown): unknown }).createTreeView('v', { treeDataProvider })
    expect(d.windowApi.createTreeView).toHaveBeenCalledWith('v', { treeDataProvider })
  })
})
