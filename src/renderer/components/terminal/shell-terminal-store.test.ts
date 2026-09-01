import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addTerminal, closeTerminal, dismissScopeError, getScope, openScope,
  resetShellTerminalStore, setActiveTerminal, subscribeShellTerminals,
} from './shell-terminal-store'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  resetShellTerminalStore()
  let n = 0
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'shell:create') return Promise.resolve({ sessionId: `s${++n}` })
    return Promise.resolve(undefined)
  })
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => () => {}),
  }
})

describe('shell terminal store', () => {
  it('returns a stable empty snapshot for an unknown or null cwd', () => {
    expect(getScope(null)).toBe(getScope('/a'))
    expect(getScope('/a').terminals).toEqual([])
    expect(getScope('/a').state).toBe('idle')
  })

  it('adds a terminal, labels it, and makes it active', async () => {
    await addTerminal('/a', 'manifold')
    const scope = getScope('/a')
    expect(scope.terminals).toEqual([{ sessionId: 's1', label: 'Manifold 1', mode: 'manifold', cwd: '/a' }])
    expect(scope.activeSessionId).toBe('s1')
  })

  // The scope key stays the workspace's primary checkout so the tab set never
  // swaps; which folder a given tab runs in is chosen per tab on top of that.
  it('opens a terminal in the chosen folder while keeping it in the workspace set', async () => {
    await addTerminal('/a', 'manifold', '/a/packages/api')
    expect(mockInvoke).toHaveBeenCalledWith('shell:create', '/a/packages/api', { mode: 'manifold' })
    expect(getScope('/a').terminals[0].cwd).toBe('/a/packages/api')
    expect(getScope('/a/packages/api').terminals).toEqual([])
  })

  it('defaults a terminal to the scope folder when none is chosen', async () => {
    await addTerminal('/a', 'manifold')
    expect(mockInvoke).toHaveBeenCalledWith('shell:create', '/a', { mode: 'manifold' })
    expect(getScope('/a').terminals[0].cwd).toBe('/a')
  })

  it('persists each tab under its own folder, not the scope key', async () => {
    await addTerminal('/a', 'manifold')
    getScope('/a').state = 'ready'
    await addTerminal('/a', 'manifold', '/a/packages/api')
    expect(mockInvoke).toHaveBeenCalledWith('shell-tabs:set', '/a', {
      tabs: [
        { label: 'Manifold 1', cwd: '/a', mode: 'manifold' },
        { label: 'Manifold 2', cwd: '/a/packages/api', mode: 'manifold' },
      ],
      counter: 3,
    })
  })

  it('keeps two cwds independent', async () => {
    await addTerminal('/a', 'manifold')
    await addTerminal('/b', 'system')
    expect(getScope('/a').terminals).toHaveLength(1)
    expect(getScope('/b').terminals[0].label).toBe('System 1')
  })

  it('never renumbers: the counter is monotonic per cwd', async () => {
    await addTerminal('/a', 'manifold')
    await addTerminal('/a', 'manifold')
    closeTerminal('/a', 's1')
    await addTerminal('/a', 'manifold')
    expect(getScope('/a').terminals.map((t) => t.label)).toEqual(['Manifold 2', 'Manifold 3'])
  })

  it('kills the pty when a terminal is closed by the user', async () => {
    await addTerminal('/a', 'manifold')
    closeTerminal('/a', 's1')
    expect(mockInvoke).toHaveBeenCalledWith('shell:kill', 's1')
    expect(getScope('/a').terminals).toEqual([])
  })

  it('does not kill the pty when the shell exited on its own', async () => {
    await addTerminal('/a', 'manifold')
    closeTerminal('/a', 's1', { kill: false })
    expect(mockInvoke).not.toHaveBeenCalledWith('shell:kill', 's1')
  })

  it('activates the neighbour when the active terminal is closed', async () => {
    await addTerminal('/a', 'manifold')
    await addTerminal('/a', 'manifold')
    await addTerminal('/a', 'manifold')
    setActiveTerminal('/a', 's2')
    closeTerminal('/a', 's2')
    expect(getScope('/a').activeSessionId).toBe('s1')
    closeTerminal('/a', 's1')
    expect(getScope('/a').activeSessionId).toBe('s3')
    closeTerminal('/a', 's3')
    expect(getScope('/a').activeSessionId).toBeNull()
  })

  it('notifies subscribers and swaps the entry identity on mutation', async () => {
    const listener = vi.fn()
    subscribeShellTerminals(listener)
    const before = getScope('/a')
    await addTerminal('/a', 'manifold')
    expect(listener).toHaveBeenCalled()
    expect(getScope('/a')).not.toBe(before)
  })

  it('persists tabs only once the scope is ready', async () => {
    await addTerminal('/a', 'manifold')
    expect(mockInvoke).not.toHaveBeenCalledWith('shell-tabs:set', expect.anything(), expect.anything())

    getScope('/a').state = 'ready'   // Task 3 sets this via the open sequence
    await addTerminal('/a', 'system')
    expect(mockInvoke).toHaveBeenCalledWith('shell-tabs:set', '/a', {
      tabs: [
        { label: 'Manifold 1', cwd: '/a', mode: 'manifold' },
        { label: 'System 2', cwd: '/a', mode: 'system' },
      ],
      counter: 3,
    })
  })
})

describe('openScope', () => {
  it('creates exactly one terminal when nothing is saved', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') return Promise.resolve(null)
      if (channel === 'shell:create') return Promise.resolve({ sessionId: 's1' })
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    expect(getScope('/a').terminals).toHaveLength(1)
    expect(getScope('/a').state).toBe('ready')
  })

  it('restores a saved set, carries its counter, and does not also auto-create', async () => {
    let n = 0
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') {
        return Promise.resolve({
          tabs: [{ label: 'Manifold 1', cwd: '/a', mode: 'manifold' },
                 { label: 'System 2', cwd: '/a', mode: 'system' }],
          counter: 3,
        })
      }
      if (channel === 'shell:create') return Promise.resolve({ sessionId: `r${++n}` })
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    expect(getScope('/a').terminals.map((t) => t.label)).toEqual(['Manifold 1', 'System 2'])
    expect(getScope('/a').counter).toBe(3)
  })

  it('restores each saved tab in the folder it was opened in', async () => {
    const created: string[] = []
    mockInvoke.mockImplementation((channel: string, cwd: string) => {
      if (channel === 'shell-tabs:get') {
        return Promise.resolve({
          tabs: [{ label: 'Manifold 1', cwd: '/a', mode: 'manifold' },
                 { label: 'Manifold 2', cwd: '/a/packages/api', mode: 'manifold' }],
          counter: 3,
        })
      }
      if (channel === 'shell:create') { created.push(cwd); return Promise.resolve({ sessionId: `r${created.length}` }) }
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    expect(created).toEqual(['/a', '/a/packages/api'])
    expect(getScope('/a').terminals.map((t) => t.cwd)).toEqual(['/a', '/a/packages/api'])
  })

  // Sets saved before terminals had folders of their own.
  it('restores a saved tab with no folder into the scope folder', async () => {
    const created: string[] = []
    mockInvoke.mockImplementation((channel: string, cwd: string) => {
      if (channel === 'shell-tabs:get') {
        return Promise.resolve({ tabs: [{ label: 'Manifold 1', mode: 'manifold' }], counter: 2 })
      }
      if (channel === 'shell:create') { created.push(cwd); return Promise.resolve({ sessionId: 'r1' }) }
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    expect(created).toEqual(['/a'])
    expect(getScope('/a').terminals[0].cwd).toBe('/a')
  })

  it('is idempotent under a double-mount: two concurrent opens create one terminal', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') return Promise.resolve(null)
      if (channel === 'shell:create') return Promise.resolve({ sessionId: 's1' })
      return Promise.resolve(undefined)
    })
    await Promise.all([openScope('/a'), openScope('/a')])
    expect(mockInvoke.mock.calls.filter((c) => c[0] === 'shell:create')).toHaveLength(1)
  })

  it('does not respawn a scope the user emptied', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') return Promise.resolve(null)
      if (channel === 'shell:create') return Promise.resolve({ sessionId: 's1' })
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    closeTerminal('/a', 's1')
    await openScope('/a')
    expect(getScope('/a').terminals).toEqual([])
    expect(mockInvoke.mock.calls.filter((c) => c[0] === 'shell:create')).toHaveLength(1)
  })

  it('reaches ready after a failed create, records the error, and keeps saved tabs', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') return Promise.resolve(null)
      if (channel === 'shell:create') return Promise.reject(new Error('spawn failed'))
      return Promise.resolve(undefined)
    })
    await expect(openScope('/a')).resolves.toBeUndefined()
    expect(getScope('/a').state).toBe('ready')
    expect(getScope('/a').terminals).toEqual([])
    expect(getScope('/a').error).toBe('spawn failed')
    // An empty list must not overwrite what we failed to restore.
    expect(mockInvoke).not.toHaveBeenCalledWith('shell-tabs:set', expect.anything(), expect.anything())
  })

  it('does not persist while the scope is still opening', async () => {
    const calls: string[] = []
    mockInvoke.mockImplementation((channel: string) => {
      calls.push(channel)
      if (channel === 'shell-tabs:get') return Promise.resolve(null)
      if (channel === 'shell:create') return Promise.resolve({ sessionId: 's1' })
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    // The only shell-tabs:set is the one the finally emits, after shell:create.
    expect(calls.filter((c) => c === 'shell-tabs:set')).toHaveLength(1)
    expect(calls.indexOf('shell-tabs:set')).toBeGreaterThan(calls.indexOf('shell:create'))
  })

  it('keeps saved tabs and reports when every one of them fails to spawn', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') {
        return Promise.resolve({ tabs: [{ label: 'Manifold 1', cwd: '/a', mode: 'manifold' }], counter: 2 })
      }
      if (channel === 'shell:create') return Promise.reject(new Error('no such directory'))
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    expect(getScope('/a').error).toBe('no such directory')
    expect(mockInvoke).not.toHaveBeenCalledWith('shell-tabs:set', expect.anything(), expect.anything())
  })

  it('clears a recorded error once a terminal is successfully added', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') return Promise.resolve(null)
      if (channel === 'shell:create') return Promise.reject(new Error('spawn failed'))
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    expect(getScope('/a').error).toBe('spawn failed')

    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell:create') return Promise.resolve({ sessionId: 's9' })
      return Promise.resolve(undefined)
    })
    await addTerminal('/a', 'manifold')
    expect(getScope('/a').error).toBeNull()
  })

  it('records a failed add without throwing, and dismisses per scope', async () => {
    mockInvoke.mockImplementation(() => Promise.reject(new Error('nope')))
    await expect(addTerminal('/a', 'manifold')).resolves.toBeUndefined()
    expect(getScope('/a').error).toBe('nope')
    expect(getScope('/b').error).toBeNull()
    dismissScopeError('/a')
    expect(getScope('/a').error).toBeNull()
  })

  it('skips a saved tab that fails to spawn', async () => {
    mockInvoke.mockImplementation((channel: string, _cwd?: unknown, opts?: unknown) => {
      if (channel === 'shell-tabs:get') {
        return Promise.resolve({
          tabs: [{ label: 'Manifold 1', cwd: '/a', mode: 'manifold' },
                 { label: 'System 2', cwd: '/a', mode: 'system' }],
          counter: 3,
        })
      }
      if (channel === 'shell:create') {
        return (opts as { mode: string }).mode === 'system'
          ? Promise.reject(new Error('nope'))
          : Promise.resolve({ sessionId: 'ok' })
      }
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    expect(getScope('/a').terminals.map((t) => t.label)).toEqual(['Manifold 1'])
  })
})

describe('agent:exit', () => {
  it('drops the tab whose shell exited, without killing it again', async () => {
    const handlers: Record<string, (payload: unknown) => void> = {}
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      invoke: mockInvoke,
      on: (channel: string, handler: (...args: unknown[]) => void) => {
        handlers[channel] = handler as (payload: unknown) => void
        return () => {}
      },
    }

    await addTerminal('/a', 'manifold')
    await addTerminal('/a', 'manifold')
    handlers['agent:exit']({ sessionId: 's1', code: 0 })

    expect(getScope('/a').terminals.map((t) => t.sessionId)).toEqual(['s2'])
    expect(mockInvoke).not.toHaveBeenCalledWith('shell:kill', 's1')
  })

  it('ignores an exit for a session it does not own', async () => {
    const handlers: Record<string, (payload: unknown) => void> = {}
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      invoke: mockInvoke,
      on: (channel: string, handler: (...args: unknown[]) => void) => {
        handlers[channel] = handler as (payload: unknown) => void
        return () => {}
      },
    }
    await addTerminal('/a', 'manifold')
    expect(() => handlers['agent:exit']({ sessionId: 'someone-elses-agent', code: 0 })).not.toThrow()
    expect(getScope('/a').terminals).toHaveLength(1)
  })
})
