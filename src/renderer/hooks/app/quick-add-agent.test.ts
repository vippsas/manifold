import { describe, it, expect, vi } from 'vitest'
import type { AgentSession } from '../../../shared/types'
import { createSingleFlight, resolveQuickAddLaunch } from './quick-add-agent'

const agent = (displayName?: string): AgentSession => ({
  id: displayName ?? 'x', projectId: 'p', runtimeId: 'claude', branchName: 'b', worktreePath: '/w',
  status: 'running', pid: 1, additionalDirs: [], ...(displayName ? { displayName } : {}),
})

describe('resolveQuickAddLaunch', () => {
  it('uses the default runtime and mode when the workspace has no override', () => {
    expect(resolveQuickAddLaunch({ defaultRuntime: 'claude', defaultAgentMode: 'interactive', workspaceSessions: [] }))
      .toEqual({ runtimeId: 'claude', displayName: 'Claude', nonInteractive: false })
  })

  it('prefers the workspace runtime over the default', () => {
    expect(resolveQuickAddLaunch({ workspaceRuntimeId: 'codex', defaultRuntime: 'claude', workspaceSessions: [] }).runtimeId)
      .toBe('codex')
  })

  it('honours a chat default mode', () => {
    expect(resolveQuickAddLaunch({ defaultRuntime: 'claude', defaultAgentMode: 'chat', workspaceSessions: [] }).nonInteractive)
      .toBe(true)
  })

  it('always starts an orchestrator in chat', () => {
    expect(resolveQuickAddLaunch({ defaultRuntime: 'viola', defaultAgentMode: 'interactive', workspaceSessions: [] }).nonInteractive)
      .toBe(true)
  })

  it('takes a dropdown pick as given, runtime and mode, ignoring the defaults', () => {
    expect(resolveQuickAddLaunch({
      workspaceRuntimeId: 'codex', defaultRuntime: 'claude', defaultAgentMode: 'chat',
      pick: { runtimeId: 'gemini', mode: 'interactive' }, workspaceSessions: [],
    })).toEqual({ runtimeId: 'gemini', displayName: 'Gemini', nonInteractive: false })
  })

  it('names the agent past the ones the workspace already has', () => {
    const launch = resolveQuickAddLaunch({ defaultRuntime: 'claude', workspaceSessions: [agent('Claude'), agent('Claude 2')] })
    expect(launch.displayName).toBe('Claude 3')
  })
})

describe('createSingleFlight', () => {
  it('drops a call made while another is still running, and runs the next one after it settles', async () => {
    const once = createSingleFlight()
    let release: () => void = () => {}
    const run = vi.fn(() => new Promise<string>((resolve) => { release = () => resolve('done') }))

    const first = once(run)
    const second = once(run)
    expect(await second).toBeUndefined()
    release()
    expect(await first).toBe('done')
    expect(run).toHaveBeenCalledTimes(1)

    const third = once(async () => 'again')
    expect(await third).toBe('again')
  })

  it('lets the next call through after a run that threw', async () => {
    const once = createSingleFlight()
    await expect(once(async () => { throw new Error('boom') })).rejects.toThrow('boom')

    expect(await once(async () => 'ok')).toBe('ok')
  })
})
