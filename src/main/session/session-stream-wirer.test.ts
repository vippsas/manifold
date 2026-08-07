// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./shell-suggestion', () => ({
  predictNextCommand: vi.fn(),
  dismissSuggestion: vi.fn(),
}))

import { ChatAdapter } from '../agent/chat-adapter'
import { hasShellPromptAtEnd, SessionStreamWirer } from './session-stream-wirer'
import { NlInputBuffer } from './nl-command-translator'
import { predictNextCommand } from './shell-suggestion'
import type { InternalSession } from './session-types'

class FakePtyPool {
  private dataHandlers = new Map<string, Array<(data: string) => void>>()
  private exitHandlers = new Map<string, Array<(code: number) => void>>()

  onData(id: string, handler: (data: string) => void): void {
    this.dataHandlers.set(id, [...(this.dataHandlers.get(id) ?? []), handler])
  }

  onExit(id: string, handler: (code: number) => void): void {
    this.exitHandlers.set(id, [...(this.exitHandlers.get(id) ?? []), handler])
  }

  emitData(id: string, data: string): void {
    for (const handler of this.dataHandlers.get(id) ?? []) handler(data)
  }

  emitExit(id: string, code = 0): void {
    for (const handler of this.exitHandlers.get(id) ?? []) handler(code)
  }
}

function createSession(): InternalSession {
  return {
    id: 'session-1',
    projectId: 'project-1',
    runtimeId: 'codex',
    branchName: 'main',
    worktreePath: '/tmp/app',
    status: 'running',
    pid: 123,
    ptyId: 'pty-1',
    outputBuffer: '',
    additionalDirs: [],
    noWorktree: true,
    nonInteractive: true,
    nonInteractiveOutputMode: 'codex-jsonl',
  }
}

describe('SessionStreamWirer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not promote preview URLs mentioned only in assistant text', () => {
    const ptyPool = new FakePtyPool()
    const chatAdapter = new ChatAdapter()
    const sendToRenderer = vi.fn()
    const onDevServerNeeded = vi.fn()

    const wirer = new SessionStreamWirer(
      ptyPool as never,
      () => chatAdapter,
      sendToRenderer,
      undefined,
      vi.fn(),
      onDevServerNeeded,
    )

    const session = createSession()
    wirer.wireStreamJsonOutput(session.ptyId, session, 'codex-jsonl')
    wirer.wirePrintModeInitialExitHandling(session.ptyId, session)

    ptyPool.emitData(
      session.ptyId,
      `${JSON.stringify({
        type: 'item.completed',
        item: {
          type: 'agent_message',
          text: 'Vite failed with 127.0.0.1:5173, so preview did not start.',
        },
      })}\n${JSON.stringify({ type: 'turn.completed' })}\n`,
    )
    ptyPool.emitExit(session.ptyId, 0)

    expect(session.detectedUrl).toBeUndefined()
    expect(onDevServerNeeded).toHaveBeenCalledWith(session)
    expect(sendToRenderer).not.toHaveBeenCalledWith('preview:url-detected', expect.anything())
    expect(chatAdapter.getMessages(session.id)).toEqual([
      expect.objectContaining({
        role: 'agent',
        text: 'Vite failed with 127.0.0.1:5173, so preview did not start.',
      }),
    ])
  })

  it('ignores a stale initial-exit when a follow-up turn has replaced the PTY', () => {
    const ptyPool = new FakePtyPool()
    const sendToRenderer = vi.fn()
    const onDevServerNeeded = vi.fn()

    const wirer = new SessionStreamWirer(
      ptyPool as never,
      () => null,
      sendToRenderer,
      undefined,
      vi.fn(),
      onDevServerNeeded,
    )

    const session = createSession()
    wirer.wirePrintModeInitialExitHandling(session.ptyId, session)

    // A follow-up turn killed the initial PTY and assigned a new one.
    const initialPtyId = session.ptyId
    session.ptyId = 'pty-followup'
    session.pid = 999
    session.status = 'running'

    // The killed PTY's exit event still fires after the swap.
    ptyPool.emitExit(initialPtyId, 0)

    // The stale exit must not wipe the follow-up's ptyId/pid or spawn a dev server.
    expect(session.ptyId).toBe('pty-followup')
    expect(session.pid).toBe(999)
    expect(onDevServerNeeded).not.toHaveBeenCalled()
  })

  it('ignores an interactive PTY exit after agent settings replace that process', () => {
    const ptyPool = new FakePtyPool()
    const sendToRenderer = vi.fn()
    const wirer = new SessionStreamWirer(
      ptyPool as never,
      () => null,
      sendToRenderer,
      undefined,
      vi.fn(),
      vi.fn(),
    )
    const session = createSession()
    const previousPtyId = session.ptyId
    wirer.wireExitHandling(previousPtyId, session)

    session.ptyId = 'pty-replacement'
    session.pid = 999
    ptyPool.emitExit(previousPtyId, 0)

    expect(session.ptyId).toBe('pty-replacement')
    expect(session.pid).toBe(999)
    expect(sendToRenderer).not.toHaveBeenCalledWith('agent:exit', expect.anything())
  })

  it('stores Codex generated image payloads in the project and publishes chat image references', async () => {
    const ptyPool = new FakePtyPool()
    const chatAdapter = new ChatAdapter()
    const sendToRenderer = vi.fn()
    const worktreePath = await mkdtemp(join(tmpdir(), 'manifold-generated-image-project-'))

    try {
      const wirer = new SessionStreamWirer(
        ptyPool as never,
        () => chatAdapter,
        sendToRenderer,
        undefined,
        vi.fn(),
        vi.fn(),
      )

      const session = createSession()
      session.worktreePath = worktreePath
      wirer.wireStreamJsonOutput(session.ptyId, session, 'codex-jsonl')

      ptyPool.emitData(
        session.ptyId,
        `${JSON.stringify({
          type: 'event_msg',
          payload: {
            type: 'image_generation_end',
            call_id: 'ig_test_image',
            result: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64'),
          },
        })}\n`,
      )

      const savedPath = join(worktreePath, 'public', 'generated-images', 'ig_test_image.png')
      await vi.waitFor(async () => {
        expect(await readFile(savedPath)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      })
      expect(chatAdapter.getMessages(session.id)).toEqual([
        expect.objectContaining({
          role: 'agent',
          text: `[image: ${savedPath}]`,
        }),
      ])
    } finally {
      await rm(worktreePath, { recursive: true, force: true })
    }
  })

  it('copies Codex saved image paths into the project before publishing chat references', async () => {
    const ptyPool = new FakePtyPool()
    const chatAdapter = new ChatAdapter()
    const codexHome = await mkdtemp(join(tmpdir(), 'manifold-codex-source-image-'))
    const sourceRoot = join(codexHome, 'generated_images', 'turn-1')
    const worktreePath = await mkdtemp(join(tmpdir(), 'manifold-generated-image-project-'))

    try {
      const sourcePath = join(sourceRoot, 'codex-image.png')
      await mkdir(sourceRoot, { recursive: true })
      await writeFile(sourcePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      vi.stubEnv('CODEX_HOME', codexHome)

      const wirer = new SessionStreamWirer(
        ptyPool as never,
        () => chatAdapter,
        vi.fn(),
        undefined,
        vi.fn(),
        vi.fn(),
      )

      const session = createSession()
      session.worktreePath = worktreePath
      wirer.wireStreamJsonOutput(session.ptyId, session, 'codex-jsonl')

      ptyPool.emitData(
        session.ptyId,
        `${JSON.stringify({
          type: 'event_msg',
          payload: {
            type: 'image_generation_end',
            saved_path: sourcePath,
          },
        })}\n`,
      )

      const savedPath = join(worktreePath, 'public', 'generated-images', 'codex-image.png')
      await vi.waitFor(async () => {
        expect(await readFile(savedPath)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      })
      expect(chatAdapter.getMessages(session.id)).toEqual([
        expect.objectContaining({
          role: 'agent',
          text: `[image: ${savedPath}]`,
        }),
      ])
    } finally {
      vi.unstubAllEnvs()
      await rm(codexHome, { recursive: true, force: true })
      await rm(worktreePath, { recursive: true, force: true })
    }
  })

  it('copies Codex thread-generated images when no image event is emitted', async () => {
    const ptyPool = new FakePtyPool()
    const chatAdapter = new ChatAdapter()
    const codexHome = await mkdtemp(join(tmpdir(), 'manifold-codex-thread-images-'))
    const sourceRoot = join(codexHome, 'generated_images', 'thread-1')
    const worktreePath = await mkdtemp(join(tmpdir(), 'manifold-generated-image-project-'))

    try {
      vi.stubEnv('CODEX_HOME', codexHome)

      const wirer = new SessionStreamWirer(
        ptyPool as never,
        () => chatAdapter,
        vi.fn(),
        undefined,
        vi.fn(),
        vi.fn(),
      )

      const session = createSession()
      session.worktreePath = worktreePath
      wirer.wireStreamJsonOutput(session.ptyId, session, 'codex-jsonl')

      ptyPool.emitData(
        session.ptyId,
        `${JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' })}\n` +
        `${JSON.stringify({
          type: 'item.completed',
          item: {
            type: 'agent_message',
            text: 'Created the car image: a photorealistic modern sedan.',
          },
        })}\n`,
      )

      const sourcePath = join(sourceRoot, 'ig_car.png')
      await mkdir(sourceRoot, { recursive: true })
      await writeFile(sourcePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

      ptyPool.emitData(session.ptyId, `${JSON.stringify({ type: 'turn.completed' })}\n`)

      const savedPath = join(worktreePath, 'public', 'generated-images', 'ig_car.png')
      await vi.waitFor(async () => {
        expect(await readFile(savedPath)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      })
      expect(chatAdapter.getMessages(session.id)).toEqual([
        expect.objectContaining({
          role: 'agent',
          text: 'Created the car image: a photorealistic modern sedan.',
        }),
        expect.objectContaining({
          role: 'agent',
          text: `[image: ${savedPath}]`,
        }),
      ])

      ptyPool.emitData(session.ptyId, `${JSON.stringify({ type: 'turn.completed' })}\n`)

      expect(chatAdapter.getMessages(session.id).filter((m) => m.text === `[image: ${savedPath}]`)).toHaveLength(1)
    } finally {
      vi.unstubAllEnvs()
      await rm(codexHome, { recursive: true, force: true })
      await rm(worktreePath, { recursive: true, force: true })
    }
  })

  it('publishes Codex event_msg agent messages', () => {
    const ptyPool = new FakePtyPool()
    const chatAdapter = new ChatAdapter()

    const wirer = new SessionStreamWirer(
      ptyPool as never,
      () => chatAdapter,
      vi.fn(),
      undefined,
      vi.fn(),
      vi.fn(),
    )

    const session = createSession()
    wirer.wireStreamJsonOutput(session.ptyId, session, 'codex-jsonl')

    ptyPool.emitData(
      session.ptyId,
      `${JSON.stringify({
        type: 'event_msg',
        payload: {
          type: 'agent_message',
          message: 'Created a polished studio-style bike image.',
        },
      })}\n`,
    )

    expect(chatAdapter.getMessages(session.id)).toEqual([
      expect.objectContaining({
        role: 'agent',
        text: 'Created a polished studio-style bike image.',
      }),
    ])
  })

  it('records Codex turn completion time from structured events', () => {
    const ptyPool = new FakePtyPool()
    const onDevServerNeeded = vi.fn()

    const wirer = new SessionStreamWirer(
      ptyPool as never,
      () => null,
      vi.fn(),
      undefined,
      vi.fn(),
      onDevServerNeeded,
    )

    const session = createSession()
    const before = Date.now()
    wirer.wireStreamJsonOutput(session.ptyId, session, 'codex-jsonl')

    ptyPool.emitData(session.ptyId, `${JSON.stringify({ type: 'turn.completed' })}\n`)

    expect(session.lastTurnCompletedTime).toBeGreaterThanOrEqual(before)
    expect(onDevServerNeeded).toHaveBeenCalledWith(session)
  })

  it('still promotes preview URLs from actual plain-text process output', () => {
    const ptyPool = new FakePtyPool()
    const sendToRenderer = vi.fn()

    const wirer = new SessionStreamWirer(
      ptyPool as never,
      () => null,
      sendToRenderer,
      undefined,
      vi.fn(),
      vi.fn(),
    )

    const session = createSession()
    session.runtimeId = 'gemini'
    wirer.wireOutputStreaming(session.ptyId, session)

    ptyPool.emitData(session.ptyId, 'Local: http://127.0.0.1:5174/\n')

    expect(session.detectedUrl).toBe('http://127.0.0.1:5174/')
    expect(sendToRenderer).toHaveBeenCalledWith('preview:url-detected', {
      sessionId: session.id,
      url: 'http://127.0.0.1:5174/',
    })
  })

  it('predicts immediately on the first empty shell prompt', () => {
    const ptyPool = new FakePtyPool()
    const sendToRenderer = vi.fn()

    const wirer = new SessionStreamWirer(
      ptyPool as never,
      () => null,
      sendToRenderer,
      undefined,
      vi.fn(),
      vi.fn(),
    )

    const session = createSession()
    session.runtimeId = '__shell__'
    session.nlInputBuffer = new NlInputBuffer()

    wirer.setGitOps({ aiGenerate: vi.fn() } as never)
    wirer.wireOutputStreaming(session.ptyId, session)

    ptyPool.emitData(session.ptyId, 'app ❯ ')

    expect(vi.mocked(predictNextCommand)).toHaveBeenCalledWith(session, ptyPool, expect.anything())
  })

  it('detects shell prompts from the accumulated output buffer', () => {
    const ptyPool = new FakePtyPool()
    const sendToRenderer = vi.fn()

    const wirer = new SessionStreamWirer(
      ptyPool as never,
      () => null,
      sendToRenderer,
      undefined,
      vi.fn(),
      vi.fn(),
    )

    const session = createSession()
    session.runtimeId = '__shell__'
    session.nlInputBuffer = new NlInputBuffer()

    wirer.setGitOps({ aiGenerate: vi.fn() } as never)
    wirer.wireOutputStreaming(session.ptyId, session)

    ptyPool.emitData(session.ptyId, '\x1b[36mapp ')
    ptyPool.emitData(session.ptyId, '\x1b[37m❯\x1b[39m \x1b[?2004h')

    expect(vi.mocked(predictNextCommand)).toHaveBeenCalledWith(session, ptyPool, expect.anything())
  })

  it('does not predict when the prompt already has text', () => {
    const ptyPool = new FakePtyPool()
    const sendToRenderer = vi.fn()

    const wirer = new SessionStreamWirer(
      ptyPool as never,
      () => null,
      sendToRenderer,
      undefined,
      vi.fn(),
      vi.fn(),
    )

    const session = createSession()
    session.runtimeId = '__shell__'
    session.nlInputBuffer = new NlInputBuffer()
    session.nlInputBuffer.feed('npm run dev')

    wirer.setGitOps({ aiGenerate: vi.fn() } as never)
    wirer.wireOutputStreaming(session.ptyId, session)

    ptyPool.emitData(session.ptyId, '❯ ')

    expect(vi.mocked(predictNextCommand)).not.toHaveBeenCalled()
    expect(sendToRenderer).toHaveBeenCalledWith('agent:output', { sessionId: session.id, data: '❯ ' })
  })

  it('does not re-predict when a suggestion is already active', () => {
    const ptyPool = new FakePtyPool()
    const sendToRenderer = vi.fn()

    const wirer = new SessionStreamWirer(
      ptyPool as never,
      () => null,
      sendToRenderer,
      undefined,
      vi.fn(),
      vi.fn(),
    )

    const session = createSession()
    session.runtimeId = '__shell__'
    session.nlInputBuffer = new NlInputBuffer()
    session.shellSuggestion = { activeSuggestion: 'git status', pending: false, ghostVisible: true }

    wirer.setGitOps({ aiGenerate: vi.fn() } as never)
    wirer.wireOutputStreaming(session.ptyId, session)

    ptyPool.emitData(session.ptyId, 'app ❯ ')

    expect(vi.mocked(predictNextCommand)).not.toHaveBeenCalled()
  })

  it('broadcasts slash commands from a Claude system/init event', () => {
    const ptyPool = new FakePtyPool()
    const sendToRenderer = vi.fn()

    const wirer = new SessionStreamWirer(
      ptyPool as never,
      () => null,
      sendToRenderer,
      undefined,
      vi.fn(),
      vi.fn(),
    )

    const session = createSession()
    session.runtimeId = 'claude'
    session.nonInteractiveOutputMode = 'claude-stream-json'
    wirer.wireStreamJsonOutput(session.ptyId, session, 'claude-stream-json')

    ptyPool.emitData(
      session.ptyId,
      `${JSON.stringify({
        type: 'system',
        subtype: 'init',
        slash_commands: ['review', 'commit-commands:commit'],
      })}\n`,
    )

    expect(session.slashCommands).toEqual(['review', 'commit-commands:commit'])
    expect(sendToRenderer).toHaveBeenCalledWith('agent:slash-commands', {
      sessionId: session.id,
      commands: ['review', 'commit-commands:commit'],
    })
  })

  it('recognizes a Manifold shell prompt at the end of ANSI-styled output', () => {
    expect(hasShellPromptAtEnd('\x1b[36mapp\x1b[39m \x1b[37m❯\x1b[39m \x1b[?2004h')).toBe(true)
    expect(hasShellPromptAtEnd('\x1b[36mapp\x1b[39m \x1b[37m❯\x1b[39m \x07')).toBe(true)
    expect(hasShellPromptAtEnd('app ❯ npm test')).toBe(false)
    expect(hasShellPromptAtEnd('build output\n')).toBe(false)
  })
})
