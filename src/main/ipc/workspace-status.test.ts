import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkspaceStatusReader } from './workspace-status'
import { CheckoutStatusPoller } from '../fs/checkout-status-poller'

const git = vi.hoisted(() => ({ exec: vi.fn(), status: vi.fn() }))
vi.mock('../git/git-exec', () => ({ gitExec: git.exec }))
vi.mock('../fs/file-watcher-utils', async (importOriginal) => ({
  ...await importOriginal<typeof import('../fs/file-watcher-utils')>(),
  gitStatus: git.status,
  buildChangeFingerprint: async () => 'fixture',
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function reader(projectIds = ['p1']) {
  return createWorkspaceStatusReader({
    workspaceManager: { get: () => ({ projectIds }) },
    projectRegistry: { getProject: (id: string) => ({ id, name: id, path: `/repos/${id}` }) },
  } as never)
}

beforeEach(() => {
  vi.resetAllMocks()
  git.exec.mockImplementation(async (args: string[]) => args[0] === 'rev-list' ? '2 3\n' : 'main\n')
  git.status.mockResolvedValue('')
})

describe('workspace status single-flight', () => {
  it('runs three commands total for two concurrent consumers of one repo', async () => {
    const pending = deferred<string>()
    git.status.mockReturnValueOnce(pending.promise)
    const read = reader()
    const first = read('ws')
    const second = read('ws')
    expect(second).toBe(first)
    await Promise.resolve()
    expect(git.exec).toHaveBeenCalledTimes(2)
    expect(git.status).toHaveBeenCalledTimes(1)
    pending.resolve('')
    await Promise.all([first, second])
    expect(git.exec).toHaveBeenCalledTimes(2)
    expect(git.status).toHaveBeenCalledTimes(1)
  })

  it('shares the in-flight round and unions a burst into exactly one trailing round', async () => {
    const firstStatus = deferred<string>()
    git.status.mockReturnValueOnce(firstStatus.promise)
    const read = reader()
    const first = read('ws')
    await Promise.resolve() // Git has started: subsequent calls invalidate the round.
    const second = read('ws')
    for (let i = 0; i < 10; i++) expect(read('ws')).toBe(first)
    expect(second).toBe(first)
    // Two execs plus status: three subprocesses per repo, even with concurrent callers.
    expect(git.exec).toHaveBeenCalledTimes(2)
    expect(git.status).toHaveBeenCalledTimes(1)

    git.exec.mockImplementation(async (args: string[]) => args[0] === 'rev-list' ? '4 5\n' : 'new-branch\n')
    git.status.mockResolvedValue('UU conflict.ts\n?? new.ts\n')
    firstStatus.resolve(' M old.ts\n')
    const [a, b] = await Promise.all([first, second])
    expect(a).toBe(b)
    expect(a[0]).toMatchObject({
      branch: 'new-branch', upstreamAheadBehind: { behind: 4, ahead: 5 },
      unstaged: [{ path: 'conflict.ts', type: 'modified' }], untracked: [{ path: 'new.ts', type: 'added' }],
    })
    expect(git.exec).toHaveBeenCalledTimes(4)
    expect(git.status).toHaveBeenCalledTimes(2)

    await read('ws')
    expect(git.status).toHaveBeenCalledTimes(3) // settled flights are evicted
  })

  it('refreshes only selected repos and retains the union of partial results', async () => {
    const firstStatus = deferred<string>()
    git.status.mockReturnValueOnce(firstStatus.promise)
    const read = reader(['p1', 'p2', 'p3'])
    const first = read('ws', ['p1'])
    await Promise.resolve()
    read('ws', ['p2'])
    read('ws', ['p2'])
    read('ws', ['p1'])
    expect(git.status.mock.calls).toEqual([['/repos/p1']])
    firstStatus.resolve('')
    expect((await first).map((row) => row.projectId)).toEqual(['p1', 'p2'])
    expect(git.status.mock.calls).toEqual([['/repos/p1'], ['/repos/p1'], ['/repos/p2']])
    expect(git.exec).toHaveBeenCalledTimes(6)
  })

  it('upgrades partial invalidation to a full trailing refresh', async () => {
    const firstStatus = deferred<string>()
    git.status.mockReturnValueOnce(firstStatus.promise)
    const read = reader(['p1', 'p2'])
    const first = read('ws', ['p1'])
    await Promise.resolve()
    read('ws')
    read('ws', ['p1'])
    firstStatus.resolve('')
    expect((await first).map((row) => row.projectId)).toEqual(['p1', 'p2'])
    expect(git.status).toHaveBeenCalledTimes(3)
  })

  it('does not block a different workspace behind a slow one', async () => {
    const slow = deferred<string>()
    git.status.mockReturnValueOnce(slow.promise)
    const read = reader()
    const a = read('a')
    expect(await read('b')).toHaveLength(1)
    slow.resolve('')
    await a
    expect(git.status).toHaveBeenCalledTimes(2)
  })

  it('releases the guard after a discovery failure', async () => {
    let fail = true
    const read = createWorkspaceStatusReader({
      workspaceManager: { get: () => { if (fail) throw new Error('discovery failed'); return undefined } },
      projectRegistry: {},
    } as never)
    await expect(read('ws')).rejects.toThrow('discovery failed')
    fail = false
    await expect(read('ws')).resolves.toEqual([])
  })
})

describe('workspace status shared checkout cache', () => {
  let poller: CheckoutStatusPoller
  const events = { primary: vi.fn(), additional: vi.fn(), branch: vi.fn() }
  const fixture = 'MM both.ts\nA  staged.ts\n D deleted.ts\n?? new.ts\nUU conflict.ts\nR  old.ts -> renamed.ts\n'

  beforeEach(() => {
    vi.useFakeTimers()
    poller = new CheckoutStatusPoller(git.status, async () => 'main', events)
  })

  afterEach(() => {
    poller.unwatchAll()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it.each(['/repos/p1/', '/repos/other/../p1'])('reuses raw status for normalized checkout %s', async (checkout) => {
    git.status.mockResolvedValue(fixture)
    const read = reader()
    const uncached = await read('ws')
    git.status.mockClear()
    git.exec.mockClear()
    poller.watch(checkout, 'session')
    await vi.advanceTimersByTimeAsync(0)

    expect(await read('ws')).toEqual(uncached)
    expect(git.status).toHaveBeenCalledExactlyOnceWith('/repos/p1')
    // Branch is shared, but ahead/behind always remains a fresh workspace read.
    expect(git.exec.mock.calls).toEqual([
      [['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], '/repos/p1'],
    ])
  })

  it('shares an additional-directory producer and falls back for its absent branch', async () => {
    git.status.mockResolvedValue(fixture)
    poller.watchAdditionalDir('/repos/p1', 'session')
    await vi.advanceTimersByTimeAsync(0)
    const [row] = await reader()('ws')
    expect(row.branch).toBe('main')
    expect(row.untracked).toEqual([{ path: 'new.ts', type: 'added' }])
    expect(git.status).toHaveBeenCalledTimes(1)
    expect(git.exec).toHaveBeenCalledWith(['rev-parse', '--abbrev-ref', 'HEAD'], '/repos/p1')
  })

  it('publishes raw status before notifying consumers of changed files', async () => {
    const read = reader()
    let refreshed: ReturnType<typeof read> | undefined
    events.primary.mockImplementationOnce(() => { refreshed = read('ws') })
    git.status.mockResolvedValue(fixture)
    poller.watch('/repos/p1', 'session')
    await vi.advanceTimersByTimeAsync(0)
    expect((await refreshed)?.[0].untracked).toEqual([{ path: 'new.ts', type: 'added' }])
    expect(git.status).toHaveBeenCalledTimes(1)
  })

  it('replaces the cache on each successful tick and evicts it on the final unwatch', async () => {
    const read = reader()
    git.status.mockResolvedValue('?? old.ts\n')
    poller.watch('/repos/p1', 'primary')
    poller.watchAdditionalDir('/repos/p1', 'additional')
    await vi.advanceTimersByTimeAsync(0)
    expect((await read('ws'))[0].untracked[0].path).toBe('old.ts')

    git.status.mockResolvedValue('A  new.ts\n')
    await vi.advanceTimersByTimeAsync(2000)
    expect((await read('ws'))[0].staged[0].path).toBe('new.ts')
    expect(git.status).toHaveBeenCalledTimes(2)
    poller.unwatch('/repos/p1', 'primary')
    await read('ws')
    expect(git.status).toHaveBeenCalledTimes(2)

    poller.unwatchAdditionalDir('/repos/p1', 'additional')
    await read('ws')
    expect(git.status).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('runs status without starting a timer when no producer exists', async () => {
    const read = reader()
    await read('ws')
    await read('ws')
    expect(git.status).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('runs status while the producer has no successful snapshot yet', async () => {
    const pending = deferred<string>()
    git.status.mockReturnValueOnce(pending.promise).mockResolvedValue('?? current.ts\n')
    poller.watch('/repos/p1', 'session')
    expect((await reader()('ws'))[0].untracked[0].path).toBe('current.ts')
    expect(git.status).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)
    pending.resolve('')
    await vi.advanceTimersByTimeAsync(0)
  })

  it('expires a successful result after one interval even while a slow poll is pending', async () => {
    poller.watch('/repos/p1', 'session')
    await vi.advanceTimersByTimeAsync(0)
    const pending = deferred<string>()
    git.status.mockReturnValueOnce(pending.promise).mockResolvedValue('?? current.ts\n')
    await vi.advanceTimersByTimeAsync(2000)
    expect((await reader()('ws'))[0].untracked[0].path).toBe('current.ts')
    expect(git.status).toHaveBeenCalledTimes(3)
    pending.resolve('')
    await vi.advanceTimersByTimeAsync(0)
  })
})
