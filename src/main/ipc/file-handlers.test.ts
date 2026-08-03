import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSession, FileTreeNode } from '../../shared/types'
import type { IpcDependencies } from './types'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
    showItemInFolder: vi.fn(),
    readImage: vi.fn(),
    openTerminal: vi.fn(),
  }
})

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  shell: { showItemInFolder: mocks.showItemInFolder },
  clipboard: { readImage: mocks.readImage },
}))

vi.mock('./open-terminal', () => ({
  openTerminal: mocks.openTerminal,
}))

function makeSession(worktreePath: string, additionalDirs: string[] = []): AgentSession {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    runtimeId: 'codex',
    branchName: 'main',
    worktreePath,
    status: 'running',
    pid: 1,
    additionalDirs,
  }
}

function makeDeps(
  session: AgentSession,
  tree: FileTreeNode,
  openFolders: {
    projectPaths?: string[]
    otherSessions?: AgentSession[]
    workspaceWorktreePaths?: Record<string, string>
  } = {},
): IpcDependencies {
  const projects = (openFolders.projectPaths ?? []).map((path, index) => ({ id: `proj-${index}`, path }))
  const workspaces = openFolders.workspaceWorktreePaths
    ? [{ id: 'w1', name: 'w1', projectIds: [], createdAt: '', worktreePaths: openFolders.workspaceWorktreePaths }]
    : []
  return {
    sessionManager: {
      getSession: vi.fn(() => session),
      listSessions: vi.fn(() => [session, ...(openFolders.otherSessions ?? [])]),
    },
    workspaceManager: { list: vi.fn(() => workspaces), get: vi.fn((id: string) => workspaces.find((w) => w.id === id)) },
    projectRegistry: { getProject: vi.fn(), listProjects: vi.fn(() => projects) },
    fileWatcher: {
      getFileTree: vi.fn(() => tree),
      notifyTreeChanged: vi.fn(),
      readFile: vi.fn((path: string) => `contents of ${path}`),
    },
  } as unknown as IpcDependencies
}

describe('registerFileHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.readImage.mockReturnValue({
      isEmpty: () => true,
      toPNG: () => Buffer.alloc(0),
    })
    mocks.openTerminal.mockResolvedValue(undefined)
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

  it('writes a pasted clipboard image into the requested directory', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const root = await mkdtemp(join(tmpdir(), 'manifold-paste-image-test-'))
    const targetDir = join(root, 'assets')
    const tree: FileTreeNode = { name: 'repo', path: root, isDirectory: true, children: [] }

    try {
      await mkdir(targetDir)
      const deps = makeDeps(makeSession(root), tree)
      registerFileHandlers(deps)
      const handler = mocks.handlers.get('files:paste-image')
      if (!handler) throw new Error('files:paste-image handler was not registered')

      const result = await handler({}, 'sess-1', targetDir, 'data:image/png;base64,iVBORw==')

      expect(result).toEqual({ path: join(targetDir, 'pasted-image.png'), tree })
      await expect(readFile(join(targetDir, 'pasted-image.png'))).resolves.toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      expect(deps.fileWatcher.notifyTreeChanged).toHaveBeenCalledWith('sess-1', undefined)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('chooses a suffix instead of overwriting an existing pasted image', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const root = await mkdtemp(join(tmpdir(), 'manifold-paste-image-test-'))
    const tree: FileTreeNode = { name: 'repo', path: root, isDirectory: true, children: [] }

    try {
      const deps = makeDeps(makeSession(root), tree)
      registerFileHandlers(deps)
      const handler = mocks.handlers.get('files:paste-image')
      if (!handler) throw new Error('files:paste-image handler was not registered')

      await handler({}, 'sess-1', root, 'data:image/png;base64,iVBORw==')
      const result = await handler({}, 'sess-1', root, 'data:image/png;base64,iVBORw==')

      expect(result).toEqual({ path: join(root, 'pasted-image-1.png'), tree })
      await expect(readFile(join(root, 'pasted-image.png'))).resolves.toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      await expect(readFile(join(root, 'pasted-image-1.png'))).resolves.toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects paste targets outside the active session roots', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const root = await mkdtemp(join(tmpdir(), 'manifold-paste-image-test-'))
    const outside = await mkdtemp(join(tmpdir(), 'manifold-paste-image-outside-'))
    const tree: FileTreeNode = { name: 'repo', path: root, isDirectory: true, children: [] }

    try {
      registerFileHandlers(makeDeps(makeSession(root), tree))
      const handler = mocks.handlers.get('files:paste-image')
      if (!handler) throw new Error('files:paste-image handler was not registered')

      expect(() => handler({}, 'sess-1', outside, 'data:image/png;base64,iVBORw=='))
        .toThrow('Path traversal denied')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('writes the current system clipboard image into the requested directory', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const root = await mkdtemp(join(tmpdir(), 'manifold-paste-clipboard-image-test-'))
    const tree: FileTreeNode = { name: 'repo', path: root, isDirectory: true, children: [] }

    try {
      mocks.readImage.mockReturnValue({
        isEmpty: () => false,
        toPNG: () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      })
      const deps = makeDeps(makeSession(root), tree)
      registerFileHandlers(deps)
      const handler = mocks.handlers.get('files:paste-clipboard-image')
      if (!handler) throw new Error('files:paste-clipboard-image handler was not registered')

      const result = await handler({}, 'sess-1', root)

      expect(result).toEqual({ pasted: true, path: join(root, 'pasted-image.png'), tree })
      await expect(readFile(join(root, 'pasted-image.png'))).resolves.toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      expect(deps.fileWatcher.notifyTreeChanged).toHaveBeenCalledWith('sess-1', undefined)
    } finally {
      await rm(root, { recursive: true, force: true })
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

  it('returns pasted=false when the system clipboard has no image', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const root = await mkdtemp(join(tmpdir(), 'manifold-paste-clipboard-image-test-'))
    const tree: FileTreeNode = { name: 'repo', path: root, isDirectory: true, children: [] }

    try {
      const deps = makeDeps(makeSession(root), tree)
      registerFileHandlers(deps)
      const handler = mocks.handlers.get('files:paste-clipboard-image')
      if (!handler) throw new Error('files:paste-clipboard-image handler was not registered')

      expect(await handler({}, 'sess-1', root)).toEqual({ pasted: false })
      expect(deps.fileWatcher.notifyTreeChanged).not.toHaveBeenCalled()
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
