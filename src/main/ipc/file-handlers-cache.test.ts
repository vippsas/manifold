import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileWatcher } from '../fs/file-watcher'
import {
  getCachedCheckoutStatus, registerCheckoutStatus, removeCheckoutStatus,
  type CheckoutStatusCacheEntry,
} from '../fs/checkout-status-cache'
import { gitExec } from '../git/git-exec'
import { parseWorkspaceStatus } from '../git/porcelain-status'
import { registerFileHandlers } from './file-handlers'
import { createWorkspaceStatusReader } from './workspace-status'
import { makeDeps, makeSession } from './file-handlers.test-helpers'

const fakes = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  status: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => fakes.handlers.set(channel, fn) },
  shell: {},
  clipboard: { readImage: () => ({ isEmpty: () => false, toPNG: () => Buffer.from('image') }) },
}))
vi.mock('../fs/file-watcher-utils', async (importOriginal) => ({
  ...await importOriginal<typeof import('../fs/file-watcher-utils')>(),
  gitStatus: fakes.status,
}))

describe('file mutations invalidate workspace status', () => {
  let base: string
  let root: string
  let other: string
  let entry: CheckoutStatusCacheEntry
  let otherEntry: CheckoutStatusCacheEntry
  let read: ReturnType<typeof createWorkspaceStatusReader>

  beforeEach(async () => {
    vi.clearAllMocks()
    fakes.handlers.clear()
    base = await mkdtemp(join(tmpdir(), 'manifold-file-cache-'))
    root = join(base, 'repo')
    other = join(base, 'repo-other')
    await mkdir(root)
    await mkdir(other)
    await writeFile(join(root, 'file.txt'), 'before')
    await writeFile(join(base, 'source.txt'), 'imported')
    await gitExec(['init', '-b', 'main'], root)
    await gitExec(['add', '.'], root)
    await gitExec(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'initial'], root)
    fakes.status.mockImplementation((checkout: string) => gitExec(['status', '--porcelain'], checkout))

    const tree = { name: 'repo', path: root, isDirectory: true, children: [] }
    // The selected session belongs to another folder; authorization and cache
    // invalidation must follow the edited path rather than the selected agent.
    const deps = makeDeps(makeSession(other), tree, { projectPaths: [root] })
    const watcher = new FileWatcher()
    vi.spyOn(watcher, 'getFileTree').mockResolvedValue(tree)
    deps.fileWatcher = watcher
    registerFileHandlers(deps)
    read = createWorkspaceStatusReader({
      workspaceManager: { get: () => ({ projectIds: ['p1'] }) },
      projectRegistry: { getProject: () => ({ name: 'repo', path: root }) },
    } as never)
    // Seed successful poll results without introducing any timers into this test.
    entry = registerCheckoutStatus(root)
    entry.raw = { status: '', branch: 'main', successfulAt: Date.now() }
    otherEntry = registerCheckoutStatus(other)
    otherEntry.raw = { status: '', branch: 'main', successfulAt: Date.now() }
  })

  afterEach(async () => {
    removeCheckoutStatus(root, entry)
    removeCheckoutStatus(other, otherEntry)
    vi.restoreAllMocks()
    await rm(base, { recursive: true, force: true })
  })

  it.each([
    'files:write', 'files:delete', 'files:rename', 'files:create-file',
    'files:create-dir', 'files:import', 'files:paste-image', 'files:paste-clipboard-image',
  ])('%s forces a fresh status for the edited checkout', async (channel) => {
    await read('ws')
    expect(fakes.status).not.toHaveBeenCalled()
    const args: Record<string, unknown[]> = {
      'files:write': [null, join(root, 'file.txt'), 'after'],
      'files:delete': ['sess-1', join(root, 'file.txt')],
      'files:rename': ['sess-1', join(root, 'file.txt'), join(root, 'renamed.txt')],
      'files:create-file': [null, root, 'new.txt'],
      'files:create-dir': [null, root, 'new-dir'],
      'files:import': ['sess-1', root, [join(base, 'source.txt')]],
      'files:paste-image': ['sess-1', root, 'data:image/png;base64,aW1hZ2U='],
      'files:paste-clipboard-image': ['sess-1', root],
    }
    await fakes.handlers.get(channel)!({}, ...args[channel])
    const [row] = await read('ws')
    expect(row).toMatchObject(parseWorkspaceStatus(await gitExec(['status', '--porcelain'], root)))
    expect(fakes.status).toHaveBeenCalledExactlyOnceWith(root)
    // A sibling path with the same prefix is a distinct checkout.
    expect(getCachedCheckoutStatus(other)).toBeDefined()
  })

  it('invalidates both checkouts when a rename moves a file between open folders', async () => {
    await fakes.handlers.get('files:rename')!({}, 'sess-1', join(root, 'file.txt'), join(other, 'moved.txt'))
    expect(getCachedCheckoutStatus(root)).toBeUndefined()
    expect(getCachedCheckoutStatus(other)).toBeUndefined()
  })
})
