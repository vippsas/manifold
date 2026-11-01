import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkspaceStatusReader } from './workspace-status'

const git = vi.hoisted(() => ({ exec: vi.fn(), status: vi.fn() }))
vi.mock('../git/git-exec', () => ({ gitExec: git.exec }))
vi.mock('../fs/file-watcher-utils', () => ({ gitStatus: git.status }))

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
