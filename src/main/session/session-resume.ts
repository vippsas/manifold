import { getRuntimeById } from '../agent/runtimes'
import { PtyPool } from '../agent/pty-pool'
import { SessionStreamWirer } from './session-stream-wirer'
import { prepareManagedWorktree } from '../git/managed-worktree'
import { readWorktreeMeta } from '../git/worktree-meta'
import type { MemoryInjector } from '../memory/memory-injector'
import { buildShellEnv, buildWelcomeMessage, createManifoldZdotdir } from './shell-prompt'
import * as fs from 'node:fs'

import type { InternalSession } from './session-types'
import { v4 as uuidv4 } from 'uuid'

export async function resumeAgentSession(
  session: InternalSession,
  runtimeId: string,
  ptyPool: PtyPool,
  streamWirer: SessionStreamWirer,
  memoryInjector?: MemoryInjector,
): Promise<void> {
  if (!session.ollamaModel || !session.simpleTemplateTitle || !session.simplePromptInstructions) {
    const meta = await readWorktreeMeta(session.worktreePath)
    if (meta?.ollamaModel) {
      session.ollamaModel = meta.ollamaModel
    }
    if (meta?.simpleTemplateTitle) {
      session.simpleTemplateTitle = meta.simpleTemplateTitle
    }
    if (meta?.simplePromptInstructions) {
      session.simplePromptInstructions = meta.simplePromptInstructions
    }
  }

  const runtime = getRuntimeById(runtimeId)
  if (!runtime) throw new Error(`Runtime not found: ${runtimeId}`)

  if (!session.noWorktree) {
    try {
      await prepareManagedWorktree(session.worktreePath)
    } catch {
      // Best-effort: session resume should not fail just because worktree
      // guards could not be refreshed.
    }
  }

  await memoryInjector?.injectContext(session)

  const runtimeArgs = [...(runtime.args ?? [])]
  if (session.ollamaModel) {
    runtimeArgs.push('--model', session.ollamaModel)
  }

  const ptyHandle = ptyPool.spawn(runtime.binary, runtimeArgs, {
    cwd: session.worktreePath,
    env: runtime.env,
  })

  session.ptyId = ptyHandle.id
  session.pid = ptyHandle.pid
  session.runtimeId = runtimeId
  session.status = 'running'
  session.outputBuffer = ''
  session.detectedUrl = undefined

  streamWirer.wireOutputStreaming(ptyHandle.id, session)
  streamWirer.wireExitHandling(ptyHandle.id, session)
}

export function createShellPtySession(
  cwd: string,
  ptyPool: PtyPool,
  streamWirer: SessionStreamWirer,
  sessions: Map<string, InternalSession>,
  options?: { shellPrompt?: boolean; historyDir?: string },
): { sessionId: string } {
  const shell = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/zsh')
  const useManifoldPrompt = options?.shellPrompt ?? false
  const isZsh = shell.endsWith('/zsh') || shell === 'zsh'

  let env: Record<string, string> | undefined
  let zdotdirPath: string | undefined

  if (useManifoldPrompt) {
    const shellEnv = buildShellEnv(cwd)
    env = { ...shellEnv }

    if (isZsh) {
      zdotdirPath = createManifoldZdotdir(shellEnv.MANIFOLD_AGENT_NAME, options?.historyDir)
      env.ZDOTDIR = zdotdirPath
    }
  }

  const ptyHandle = ptyPool.spawn(shell, ['-il'], { cwd, env })
  const id = uuidv4()

  const session: InternalSession = {
    id,
    projectId: '',
    runtimeId: '__shell__',
    branchName: '',
    worktreePath: cwd,
    status: 'running',
    pid: ptyHandle.pid,
    ptyId: ptyHandle.id,
    outputBuffer: '',
    additionalDirs: [],
    zdotdir: zdotdirPath,
  }

  sessions.set(id, session)
  streamWirer.wireOutputStreaming(ptyHandle.id, session)
  streamWirer.wireExitHandling(ptyHandle.id, session)

  // Inject welcome message after listeners are wired so it reaches the renderer
  if (useManifoldPrompt) {
    const branch = env?.MANIFOLD_BRANCH ?? 'manifold'
    ptyPool.pushOutput(ptyHandle.id, buildWelcomeMessage(branch, cwd))
  }

  // Clean up temp ZDOTDIR when the shell exits
  if (zdotdirPath) {
    const dir = zdotdirPath
    ptyPool.onExit(ptyHandle.id, () => {
      fs.rm(dir, { recursive: true, force: true }, () => {})
    })
  }

  return { sessionId: id }
}
