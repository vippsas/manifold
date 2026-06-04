// src/plugin-host/gated-api.test.ts
import { describe, expect, it, vi } from 'vitest'
import { buildGatedApi, CapabilityError } from './gated-api'

const shared = { commands: { registerCommand: vi.fn(), executeCommand: vi.fn() } as never, window: { registerWebviewViewProvider: vi.fn() } as never }

describe('buildGatedApi', () => {
  it('always exposes commands and window', () => {
    const api = buildGatedApi([], shared, () => ({ global: {} as never }))
    expect(api.commands).toBe(shared.commands)
    expect(api.window).toBe(shared.window)
  })
  it('throws CapabilityError when storage is used without the capability', () => {
    const api = buildGatedApi([], shared, () => ({ global: {} as never }))
    expect(() => api.storage).toThrow(CapabilityError)
  })
  it('exposes storage when the capability is declared', () => {
    const storage = { global: {} as never }
    const api = buildGatedApi(['storage'], shared, () => storage)
    expect(api.storage).toBe(storage)
  })
})
