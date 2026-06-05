import { describe, expect, it, vi } from 'vitest'
import { createShimWindow } from './window'
import type { RealWindowApi } from './window'

function makeWindowApi(overrides: Partial<RealWindowApi> = {}): RealWindowApi {
  return {
    registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    createTreeView: vi.fn(() => ({ dispose: vi.fn() })),
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
    showQuickPick: vi.fn().mockResolvedValue(undefined),
    showInputBox: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('shim window', () => {
  it('routes show*Message to windowApi with the right level', async () => {
    const windowApi = makeWindowApi()
    const w = createShimWindow(windowApi)
    await (w.showInformationMessage as (m: string) => Promise<unknown>)('hi')
    await (w.showWarningMessage as (m: string) => Promise<unknown>)('careful')
    await (w.showErrorMessage as (m: string, ...r: string[]) => Promise<unknown>)('boom', 'Retry')
    expect(windowApi.showInformationMessage).toHaveBeenCalledWith('hi')
    expect(windowApi.showWarningMessage).toHaveBeenCalledWith('careful')
    expect(windowApi.showErrorMessage).toHaveBeenCalledWith('boom', 'Retry')
  })

  it('routes showQuickPick to windowApi', async () => {
    const windowApi = makeWindowApi()
    const w = createShimWindow(windowApi)
    const items = [{ label: 'x' }]
    await (w.showQuickPick as (items: unknown, opts?: unknown) => Promise<unknown>)(items, { placeholder: 'pick' })
    expect(windowApi.showQuickPick).toHaveBeenCalledWith(items, { placeholder: 'pick' })
  })

  it('routes showInputBox to windowApi', async () => {
    const windowApi = makeWindowApi()
    const w = createShimWindow(windowApi)
    await (w.showInputBox as (opts?: unknown) => Promise<unknown>)({ prompt: 'enter' })
    expect(windowApi.showInputBox).toHaveBeenCalledWith({ prompt: 'enter' })
  })

  it('createWebviewPanel throws (stays notImplemented)', () => {
    const w = createShimWindow(makeWindowApi())
    expect(() => (w as { createWebviewPanel: () => unknown }).createWebviewPanel()).toThrow(/createWebviewPanel/)
  })

  it('createTreeView delegates to windowApi', () => {
    const windowApi = makeWindowApi({ createTreeView: vi.fn(() => ({ dispose: vi.fn() })) })
    const w = createShimWindow(windowApi)
    // createTreeView is delegated to windowApi — calling with no args is fine (windowApi.createTreeView returns a disposable)
    // The old "throws" behaviour is gone; it now delegates through.
    const result = (w as { createTreeView: (id: string, opts: unknown) => unknown }).createTreeView('v', {})
    expect(windowApi.createTreeView).toHaveBeenCalledWith('v', {})
    expect(result).toBeDefined()
  })
})
