import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSession, FileTreeNode } from '../../shared/types'
import { makeDeps, makeSession } from './file-handlers.test-helpers'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
    showItemInFolder: vi.fn(),
    openTerminal: vi.fn(),
  }
})

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  shell: { showItemInFolder: mocks.showItemInFolder },
  clipboard: { readImage: vi.fn() },
}))

vi.mock('./open-terminal', () => ({
  openTerminal: mocks.openTerminal,
}))

describe('registerFileHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.openTerminal.mockResolvedValue(undefined)
  })

  it('resolves a missing session tree to null, then reads it after registration', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const session = makeSession('/worktree')
    const tree: FileTreeNode = { name: 'repo', path: '/worktree', isDirectory: true, children: [] }
    const deps = makeDeps(session, tree)
    const sessions = new Map<string, AgentSession>()
    deps.sessionManager.getSession = (id) => sessions.get(id)
    registerFileHandlers(deps)
    const handler = mocks.handlers.get('files:tree')!

    await expect(handler({}, session.id)).resolves.toBeNull()
    expect(deps.fileWatcher.getFileTree).not.toHaveBeenCalled()

    sessions.set(session.id, session)
    await expect(handler({}, session.id)).resolves.toEqual(tree)
    expect(deps.fileWatcher.getFileTree).toHaveBeenCalledWith('/worktree')
  })

  it('still rejects an unknown session when authorizing an additional directory', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const tree: FileTreeNode = { name: 'repo', path: '/worktree', isDirectory: true, children: [] }
    const deps = makeDeps(makeSession('/worktree'), tree)
    deps.sessionManager.getSession = () => undefined
    registerFileHandlers(deps)

    expect(() => mocks.handlers.get('files:tree-dir')!({}, 'missing', '/extra'))
      .toThrow('Session not found: missing')
    expect(deps.fileWatcher.getFileTree).not.toHaveBeenCalled()
  })

  // The sidebar hangs a file tree under every repo and worktree, all open at
  // once, and a click opens a file without first selecting its repo — so a path
  // is authorized against the folders the user has open, not against whichever
  // session is selected.
  it('reads a file from another open repository, not just the selected session', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const worktree = await mkdtemp(join(tmpdir(), 'manifold-roots-worktree-'))
    const otherRepo = await mkdtemp(join(tmpdir(), 'manifold-roots-other-repo-'))
    const tree: FileTreeNode = { name: 'repo', path: worktree, isDirectory: true, children: [] }

    try {
      const deps = makeDeps(makeSession(worktree), tree, { projectPaths: [otherRepo] })
      registerFileHandlers(deps)
      const handler = mocks.handlers.get('files:read')
      if (!handler) throw new Error('files:read handler was not registered')

      const target = join(otherRepo, 'README.md')
      expect(handler({}, 'sess-1', target)).toBe(`contents of ${target}`)
    } finally {
      await rm(worktree, { recursive: true, force: true })
      await rm(otherRepo, { recursive: true, force: true })
    }
  })

  it('reads a file from an idle agent’s worktree', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const worktree = await mkdtemp(join(tmpdir(), 'manifold-roots-worktree-'))
    const idleWorktree = await mkdtemp(join(tmpdir(), 'manifold-roots-idle-worktree-'))
    const tree: FileTreeNode = { name: 'repo', path: worktree, isDirectory: true, children: [] }

    try {
      const idle = { ...makeSession(idleWorktree), id: 'sess-2' }
      registerFileHandlers(makeDeps(makeSession(worktree), tree, { otherSessions: [idle] }))
      const handler = mocks.handlers.get('files:read')
      if (!handler) throw new Error('files:read handler was not registered')

      const target = join(idleWorktree, 'src', 'main.ts')
      expect(handler({}, 'sess-1', target)).toBe(`contents of ${target}`)
    } finally {
      await rm(worktree, { recursive: true, force: true })
      await rm(idleWorktree, { recursive: true, force: true })
    }
  })

  it('reads a file from a repository with no agent at all', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const repo = await mkdtemp(join(tmpdir(), 'manifold-roots-agentless-'))
    const tree: FileTreeNode = { name: 'repo', path: repo, isDirectory: true, children: [] }

    try {
      const deps = makeDeps(makeSession(repo), tree, { projectPaths: [repo] })
      // No agent anywhere means no session id to send along.
      ;(deps.sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
      ;(deps.sessionManager.listSessions as ReturnType<typeof vi.fn>).mockReturnValue([])
      registerFileHandlers(deps)
      const handler = mocks.handlers.get('files:read')
      if (!handler) throw new Error('files:read handler was not registered')

      const target = join(repo, 'README.md')
      expect(handler({}, null, target)).toBe(`contents of ${target}`)
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })

  // A workspace is a checkout in its own right, so its files open before any
  // agent has ever run in it.
  it('reads a file from a workspace checkout that has no agent', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const repo = await mkdtemp(join(tmpdir(), 'manifold-roots-repo-'))
    const checkout = await mkdtemp(join(tmpdir(), 'manifold-roots-workspace-'))
    const tree: FileTreeNode = { name: 'repo', path: repo, isDirectory: true, children: [] }

    try {
      const deps = makeDeps(makeSession(repo), tree, {
        projectPaths: [repo],
        workspaceWorktreePaths: { 'proj-0': checkout },
      })
      ;(deps.sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
      ;(deps.sessionManager.listSessions as ReturnType<typeof vi.fn>).mockReturnValue([])
      registerFileHandlers(deps)
      const handler = mocks.handlers.get('files:read')
      if (!handler) throw new Error('files:read handler was not registered')

      const target = join(checkout, 'src', 'main.ts')
      expect(handler({}, null, target)).toBe(`contents of ${target}`)
    } finally {
      await rm(repo, { recursive: true, force: true })
      await rm(checkout, { recursive: true, force: true })
    }
  })

  it('still denies a path in no open folder', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const worktree = await mkdtemp(join(tmpdir(), 'manifold-roots-worktree-'))
    const outside = await mkdtemp(join(tmpdir(), 'manifold-roots-outside-'))
    const tree: FileTreeNode = { name: 'repo', path: worktree, isDirectory: true, children: [] }

    try {
      registerFileHandlers(makeDeps(makeSession(worktree), tree))
      const handler = mocks.handlers.get('files:read')
      if (!handler) throw new Error('files:read handler was not registered')

      expect(() => handler({}, 'sess-1', join(outside, 'secrets.env'))).toThrow('Path traversal denied')
    } finally {
      await rm(worktree, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  // Creating follows reading: a workspace's files are browsable — and editable —
  // before any agent has run in it, so there is no session id to send along.
  it('creates a file and a folder in an open folder with no session selected', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const repo = await mkdtemp(join(tmpdir(), 'manifold-create-agentless-'))
    const tree: FileTreeNode = { name: 'repo', path: repo, isDirectory: true, children: [] }

    try {
      const deps = makeDeps(makeSession(repo), tree, { projectPaths: [repo] })
      ;(deps.sessionManager.getSession as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
      ;(deps.sessionManager.listSessions as ReturnType<typeof vi.fn>).mockReturnValue([])
      const createFile = vi.fn()
      const createDir = vi.fn()
      Object.assign(deps.fileWatcher, { createFile, createDir })
      registerFileHandlers(deps)

      const fileHandler = mocks.handlers.get('files:create-file')
      const dirHandler = mocks.handlers.get('files:create-dir')
      if (!fileHandler || !dirHandler) throw new Error('create handlers were not registered')

      fileHandler({}, null, repo, 'notes.md')
      dirHandler({}, null, repo, 'docs')

      expect(createFile).toHaveBeenCalledWith(join(repo, 'notes.md'))
      expect(createDir).toHaveBeenCalledWith(join(repo, 'docs'))
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })

  it('still denies creating in no open folder', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const worktree = await mkdtemp(join(tmpdir(), 'manifold-create-worktree-'))
    const outside = await mkdtemp(join(tmpdir(), 'manifold-create-outside-'))
    const tree: FileTreeNode = { name: 'repo', path: worktree, isDirectory: true, children: [] }

    try {
      const deps = makeDeps(makeSession(worktree), tree)
      const createFile = vi.fn()
      Object.assign(deps.fileWatcher, { createFile })
      registerFileHandlers(deps)
      const handler = mocks.handlers.get('files:create-file')
      if (!handler) throw new Error('files:create-file handler was not registered')

      expect(() => handler({}, 'sess-1', outside, 'secrets.env')).toThrow('Path traversal denied')
      expect(createFile).not.toHaveBeenCalled()
    } finally {
      await rm(worktree, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('rejects a ../ traversal dirPath for files:dir-branch', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const root = await mkdtemp(join(tmpdir(), 'manifold-dir-branch-test-'))
    const tree: FileTreeNode = { name: 'repo', path: root, isDirectory: true, children: [] }

    try {
      registerFileHandlers(makeDeps(makeSession(root), tree))
      const handler = mocks.handlers.get('files:dir-branch')
      if (!handler) throw new Error('files:dir-branch handler was not registered')

      await expect(handler({}, 'sess-1', '../../../etc')).rejects.toThrow('Directory not in allowed paths')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('opens an allowed directory in the platform terminal', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const root = await mkdtemp(join(tmpdir(), 'manifold-open-terminal-test-'))
    const tree: FileTreeNode = { name: 'repo', path: root, isDirectory: true, children: [] }

    try {
      registerFileHandlers(makeDeps(makeSession(root), tree))
      const handler = mocks.handlers.get('files:open-terminal')
      if (!handler) throw new Error('files:open-terminal handler was not registered')

      await handler({}, 'sess-1', root)

      expect(mocks.openTerminal).toHaveBeenCalledWith(root)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects opening a terminal outside the active session roots', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const root = await mkdtemp(join(tmpdir(), 'manifold-open-terminal-test-'))
    const outside = await mkdtemp(join(tmpdir(), 'manifold-open-terminal-outside-'))
    const tree: FileTreeNode = { name: 'repo', path: root, isDirectory: true, children: [] }

    try {
      registerFileHandlers(makeDeps(makeSession(root), tree))
      const handler = mocks.handlers.get('files:open-terminal')
      if (!handler) throw new Error('files:open-terminal handler was not registered')

      await expect(handler({}, 'sess-1', outside)).rejects.toThrow('Path traversal denied')
      expect(mocks.openTerminal).not.toHaveBeenCalled()
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('propagates a platform terminal launch failure', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const root = await mkdtemp(join(tmpdir(), 'manifold-open-terminal-test-'))
    const tree: FileTreeNode = { name: 'repo', path: root, isDirectory: true, children: [] }

    try {
      mocks.openTerminal.mockRejectedValue(new Error('Failed to open terminal'))
      registerFileHandlers(makeDeps(makeSession(root), tree))
      const handler = mocks.handlers.get('files:open-terminal')
      if (!handler) throw new Error('files:open-terminal handler was not registered')

      await expect(handler({}, 'sess-1', root)).rejects.toThrow('Failed to open terminal')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
