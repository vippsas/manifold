// src/plugin-host/gated-api.test.ts
import { describe, expect, it, vi } from 'vitest'
import { buildGatedApi, CapabilityError } from './gated-api'

const shared = { commands: { registerCommand: vi.fn(), executeCommand: vi.fn() } as never, window: { registerWebviewViewProvider: vi.fn() } as never }

const makeStorage = () => ({ global: {} as never })
const makeWorkspace = () => ({
  activeProject: undefined,
  activeSession: undefined,
  onDidChangeActiveProject: vi.fn(),
  onDidChangeActiveSession: vi.fn(),
} as never)
const makeConfiguration = () => ({
  get: vi.fn(),
  onDidChange: vi.fn(),
} as never)

describe('buildGatedApi', () => {
  it('always exposes commands and window', () => {
    const api = buildGatedApi([], shared, { storage: makeStorage, workspace: makeWorkspace, configuration: makeConfiguration })
    expect(api.commands).toBe(shared.commands)
    expect(api.window).toBe(shared.window)
  })
  it('throws CapabilityError when storage is used without the capability', () => {
    const api = buildGatedApi([], shared, { storage: makeStorage, workspace: makeWorkspace, configuration: makeConfiguration })
    expect(() => api.storage).toThrow(CapabilityError)
  })
  it('exposes storage when the capability is declared', () => {
    const storage = { global: {} as never }
    const api = buildGatedApi(['storage'], shared, { storage: () => storage, workspace: makeWorkspace, configuration: makeConfiguration })
    expect(api.storage).toBe(storage)
  })
  it('throws CapabilityError when workspace is used without workspace:read', () => {
    const api = buildGatedApi([], shared, { storage: makeStorage, workspace: makeWorkspace, configuration: makeConfiguration })
    expect(() => api.workspace).toThrow(CapabilityError)
  })
  it('exposes workspace when workspace:read is declared', () => {
    const workspace = makeWorkspace()
    const api = buildGatedApi(['workspace:read'], shared, { storage: makeStorage, workspace: () => workspace, configuration: makeConfiguration })
    expect(api.workspace).toBe(workspace)
  })
  it('throws CapabilityError when configuration is used without the capability', () => {
    const api = buildGatedApi([], shared, { storage: makeStorage, workspace: makeWorkspace, configuration: makeConfiguration })
    expect(() => api.configuration).toThrow(CapabilityError)
  })
  it('exposes configuration when the capability is declared', () => {
    const configuration = makeConfiguration()
    const api = buildGatedApi(['configuration'], shared, { storage: makeStorage, workspace: makeWorkspace, configuration: () => configuration })
    expect(api.configuration).toBe(configuration)
  })
})
