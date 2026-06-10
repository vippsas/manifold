// src/plugin-host/gated-api.test.ts
import { describe, expect, it, vi } from 'vitest'
import { buildGatedApi, CapabilityError, RestrictedCapabilityError } from './gated-api'

const shared = { commands: { registerCommand: vi.fn(), executeCommand: vi.fn() } as never, window: { registerWebviewViewProvider: vi.fn() } as never }

const makeStorage = (): never => ({ global: {} as never } as never)
const makeWorkspace = (): never => ({
  activeProject: undefined,
  activeSession: undefined,
  workspaceFolders: undefined,
  onDidChangeActiveProject: vi.fn(),
  onDidChangeActiveSession: vi.fn(),
} as never)
const makeConfiguration = (): never => ({
  get: vi.fn(),
  onDidChange: vi.fn(),
} as never)
const makeAgents = (): never => ({ activeAgent: undefined } as never)
const makeLm = (): never => ({ selectChatModels: async () => [] } as never)
const makeTranscription = (): never => ({ get: async () => undefined } as never)

const factories = { storage: makeStorage, workspace: makeWorkspace, configuration: makeConfiguration, agents: makeAgents, lm: makeLm, transcription: makeTranscription }

describe('buildGatedApi', () => {
  it('always exposes commands and window', () => {
    const api = buildGatedApi([], 'builtin', shared, factories)
    expect(api.commands).toBe(shared.commands)
    expect(api.window).toBe(shared.window)
  })
  it('throws CapabilityError when storage is used without the capability', () => {
    const api = buildGatedApi([], 'builtin', shared, factories)
    expect(() => api.storage).toThrow(CapabilityError)
  })
  it('exposes storage when the capability is declared', () => {
    const storage = { global: {} as never }
    const api = buildGatedApi(['storage'], 'builtin', shared, { ...factories, storage: () => storage as never })
    expect(api.storage).toBe(storage)
  })
  it('throws CapabilityError when workspace is used without workspace:read', () => {
    const api = buildGatedApi([], 'builtin', shared, factories)
    expect(() => api.workspace).toThrow(CapabilityError)
  })
  it('exposes workspace when workspace:read is declared', () => {
    const workspace = makeWorkspace()
    const api = buildGatedApi(['workspace:read'], 'builtin', shared, { ...factories, workspace: () => workspace })
    expect(api.workspace).toBe(workspace)
  })
  it('throws CapabilityError when configuration is used without the capability', () => {
    const api = buildGatedApi([], 'builtin', shared, factories)
    expect(() => api.configuration).toThrow(CapabilityError)
  })
  it('exposes configuration when the capability is declared', () => {
    const configuration = makeConfiguration()
    const api = buildGatedApi(['configuration'], 'builtin', shared, { ...factories, configuration: () => configuration })
    expect(api.configuration).toBe(configuration)
  })
})

describe('buildGatedApi — privileged capabilities', () => {
  it('throws CapabilityError when agent:control is not declared', () => {
    const api = buildGatedApi([], 'builtin', shared, factories)
    expect(() => api.agents).toThrow(CapabilityError)
  })
  it('throws CapabilityError when lm is not declared', () => {
    const api = buildGatedApi([], 'builtin', shared, factories)
    expect(() => api.lm).toThrow(CapabilityError)
  })
  it('restricts agent:control to builtin origin even when declared', () => {
    const api = buildGatedApi(['agent:control'], 'user', shared, factories)
    expect(() => api.agents).toThrow(RestrictedCapabilityError)
  })
  it('restricts lm to builtin origin even when declared', () => {
    const api = buildGatedApi(['lm'], 'user', shared, factories)
    expect(() => api.lm).toThrow(RestrictedCapabilityError)
  })
  it('grants agents and lm to a builtin plugin that declares them', () => {
    const api = buildGatedApi(['agent:control', 'lm'], 'builtin', shared, factories)
    expect(api.agents).toBeDefined()
    expect(api.lm).toBeDefined()
  })
  it('admits the agents namespace with only agent:spawn (no agent:control)', () => {
    const api = buildGatedApi(['agent:spawn'], 'builtin', shared, factories)
    expect(api.agents).toBeDefined()
  })
  it('passes the declared capability set to the agents factory', () => {
    const agentsFactory = vi.fn(() => makeAgents())
    const api = buildGatedApi(['agent:spawn'], 'builtin', shared, { ...factories, agents: agentsFactory })
    expect(api.agents).toBeDefined()
    expect(agentsFactory).toHaveBeenCalledWith(new Set(['agent:spawn']))
  })
  it('restricts agent:spawn to builtin origin even when declared', () => {
    const api = buildGatedApi(['agent:spawn'], 'user', shared, factories)
    expect(() => api.agents).toThrow(RestrictedCapabilityError)
  })
  it('throws CapabilityError when transcription is used without transcription:read', () => {
    const api = buildGatedApi([], 'builtin', shared, factories)
    expect(() => api.transcription).toThrow(CapabilityError)
  })
  it('restricts transcription:read to builtin origin even when declared', () => {
    const api = buildGatedApi(['transcription:read'], 'user', shared, factories)
    expect(() => api.transcription).toThrow(RestrictedCapabilityError)
  })
  it('grants transcription to a builtin plugin that declares transcription:read', () => {
    const api = buildGatedApi(['transcription:read'], 'builtin', shared, factories)
    expect(api.transcription).toBeDefined()
  })
})
