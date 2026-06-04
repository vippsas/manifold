// src/renderer/plugins/contribution-registry.subscribe.test.ts
import { describe, expect, it, afterEach, vi } from 'vitest'
import { registerPanelContribution, subscribeContributions, resetToInternal } from './contribution-registry'

afterEach(() => resetToInternal())

describe('subscribeContributions', () => {
  it('notifies on register and on reset, and unsubscribes', () => {
    const cb = vi.fn()
    const off = subscribeContributions(cb)
    registerPanelContribution({ id: 'p.v', title: 'V', description: '', launcher: true, source: 'plugin' })
    expect(cb).toHaveBeenCalledTimes(1)
    off()
    registerPanelContribution({ id: 'p.w', title: 'W', description: '', launcher: true, source: 'plugin' })
    expect(cb).toHaveBeenCalledTimes(1) // not called after unsubscribe
  })
})
