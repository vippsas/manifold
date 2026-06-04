import { describe, expect, it, vi } from 'vitest'
import { createShimWindow } from './window'

describe('shim window', () => {
  it('routes show*Message to HOST_MESSAGES with the right level', async () => {
    const $showMessage = vi.fn().mockResolvedValue(undefined)
    const w = createShimWindow({ $showMessage } as never)
    await w.showInformationMessage('hi')
    await w.showWarningMessage('careful')
    await w.showErrorMessage('boom', 'Retry')
    expect($showMessage.mock.calls).toEqual([
      ['info', 'hi', []],
      ['warning', 'careful', []],
      ['error', 'boom', ['Retry']],
    ])
  })

  it('createTreeView throws a VscodeShimError (deferred to Phase C)', () => {
    const w = createShimWindow({ $showMessage: vi.fn() } as never)
    expect(() => (w as { createTreeView: () => unknown }).createTreeView()).toThrow(/createTreeView/)
  })
})
