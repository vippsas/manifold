import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.handle,
  },
}))

describe('registerChatImageHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('reads saved chat images from the temp image directory', async () => {
    const { registerChatImageHandlers } = await import('./chat-image-handlers')
    const tempRoot = await mkdtemp(join(tmpdir(), 'manifold-chat-images-test-'))
    const safeSessionDir = join(tempRoot, 'manifold-chat-images', 'sess-1')
    const imagePath = join(safeSessionDir, 'attachment.png')

    try {
      await mkdir(safeSessionDir, { recursive: true })
      await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      const deps = {
        sessionManager: {
          listSessions: vi.fn(() => []),
        },
      }

      vi.stubEnv('TMPDIR', tempRoot)
      registerChatImageHandlers(deps as never)
      const handler = mocks.handlers.get('chat:read-pasted-image')
      if (!handler) throw new Error('chat:read-pasted-image handler was not registered')

      const result = await handler({}, imagePath)

      expect(result).toBe('data:image/png;base64,iVBORw==')
    } finally {
      vi.unstubAllEnvs()
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('reads Codex generated images from CODEX_HOME', async () => {
    const { registerChatImageHandlers } = await import('./chat-image-handlers')
    const tempRoot = await mkdtemp(join(tmpdir(), 'manifold-codex-images-test-'))
    const codexHome = join(tempRoot, 'codex-home')
    const imageDir = join(codexHome, 'generated_images', 'turn-1')
    const imagePath = join(imageDir, 'generated.png')

    try {
      await mkdir(imageDir, { recursive: true })
      await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      const deps = {
        sessionManager: {
          listSessions: vi.fn(() => []),
        },
      }

      vi.stubEnv('CODEX_HOME', codexHome)
      registerChatImageHandlers(deps as never)
      const handler = mocks.handlers.get('chat:read-pasted-image')
      if (!handler) throw new Error('chat:read-pasted-image handler was not registered')

      const result = await handler({}, imagePath)

      expect(result).toBe('data:image/png;base64,iVBORw==')
    } finally {
      vi.unstubAllEnvs()
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('reads generated images stored in the active project', async () => {
    const { registerChatImageHandlers } = await import('./chat-image-handlers')
    const worktreePath = await mkdtemp(join(tmpdir(), 'manifold-project-images-test-'))
    const imageDir = join(worktreePath, 'public', 'generated-images')
    const imagePath = join(imageDir, 'generated.png')

    try {
      await mkdir(imageDir, { recursive: true })
      await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      const deps = {
        projectRegistry: {
          listProjects: vi.fn(() => []),
        },
        sessionManager: {
          listSessions: vi.fn(() => []),
          getSession: vi.fn(() => ({ id: 'sess-1', projectId: 'proj-1', worktreePath })),
        },
      }

      registerChatImageHandlers(deps as never)
      const handler = mocks.handlers.get('chat:read-pasted-image')
      if (!handler) throw new Error('chat:read-pasted-image handler was not registered')

      const result = await handler({}, imagePath, 'sess-1')

      expect(result).toBe('data:image/png;base64,iVBORw==')
    } finally {
      await rm(worktreePath, { recursive: true, force: true })
    }
  })

  it('reads image paths relative to the active session worktree', async () => {
    const { registerChatImageHandlers } = await import('./chat-image-handlers')
    const worktreePath = await mkdtemp(join(tmpdir(), 'manifold-project-image-path-test-'))
    const imageDir = join(worktreePath, 'assets')
    const imagePath = join(imageDir, 'bike.png')

    try {
      await mkdir(imageDir, { recursive: true })
      await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      const deps = {
        projectRegistry: {
          listProjects: vi.fn(() => []),
        },
        sessionManager: {
          listSessions: vi.fn(() => []),
          getSession: vi.fn(() => ({ id: 'sess-1', projectId: 'proj-1', worktreePath })),
        },
      }

      registerChatImageHandlers(deps as never)
      const handler = mocks.handlers.get('chat:read-pasted-image')
      if (!handler) throw new Error('chat:read-pasted-image handler was not registered')

      const result = await handler({}, 'assets/bike.png', 'sess-1')

      expect(result).toBe('data:image/png;base64,iVBORw==')
    } finally {
      await rm(worktreePath, { recursive: true, force: true })
    }
  })

  it('rejects relative image paths outside the active session worktree', async () => {
    const { registerChatImageHandlers } = await import('./chat-image-handlers')
    const worktreePath = await mkdtemp(join(tmpdir(), 'manifold-project-image-path-test-'))
    const outsidePath = await mkdtemp(join(tmpdir(), 'manifold-outside-image-test-'))
    const imagePath = join(outsidePath, 'bike.png')

    try {
      await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      const deps = {
        projectRegistry: {
          listProjects: vi.fn(() => []),
        },
        sessionManager: {
          listSessions: vi.fn(() => []),
          getSession: vi.fn(() => ({ id: 'sess-1', projectId: 'proj-1', worktreePath })),
        },
      }

      registerChatImageHandlers(deps as never)
      const handler = mocks.handlers.get('chat:read-pasted-image')
      if (!handler) throw new Error('chat:read-pasted-image handler was not registered')

      await expect(handler({}, join('..', '..', imagePath), 'sess-1')).rejects.toThrow('Image path is outside')
    } finally {
      await rm(worktreePath, { recursive: true, force: true })
      await rm(outsidePath, { recursive: true, force: true })
    }
  })
})
