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
  }
})

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  shell: { showItemInFolder: mocks.showItemInFolder },
  clipboard: { readImage: mocks.readImage },
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

function makeDeps(session: AgentSession, tree: FileTreeNode): IpcDependencies {
  return {
    sessionManager: { getSession: vi.fn(() => session) },
    projectRegistry: { getProject: vi.fn() },
    fileWatcher: {
      getFileTree: vi.fn(() => tree),
      createFile: vi.fn(),
      notifyTreeChanged: vi.fn(),
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

  it('notifies tree listeners after creating a file', async () => {
    const { registerFileHandlers } = await import('./file-handlers')
    const root = await mkdtemp(join(tmpdir(), 'manifold-create-file-test-'))
    const tree: FileTreeNode = { name: 'repo', path: root, isDirectory: true, children: [] }

    try {
      const deps = makeDeps(makeSession(root), tree)
      registerFileHandlers(deps)
      const handler = mocks.handlers.get('files:create-file')
      if (!handler) throw new Error('files:create-file handler was not registered')

      const result = handler({}, 'sess-1', root, 'new-file.ts')

      expect(result).toEqual({ tree })
      expect(deps.fileWatcher.createFile).toHaveBeenCalledWith(join(root, 'new-file.ts'))
      expect(deps.fileWatcher.notifyTreeChanged).toHaveBeenCalledWith('sess-1', undefined)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
