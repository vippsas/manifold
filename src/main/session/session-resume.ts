import { getRuntimeById } from '../agent/runtimes'
import { PtyPool } from '../agent/pty-pool'
import { SessionStreamWirer } from './session-stream-wirer'
import { prepareManagedWorktree } from '../git/managed-worktree'
import { readWorktreeMeta } from '../git/worktree-meta'
import type { MemoryInjector } from '../memory/memory-injector'

import type { InternalSession } from './session-types'
import { v4 as uuidv4 } from 'uuid'

export async function resumeAgentSession(
  session: InternalSession,
  runtimeId: string,
  ptyPool: PtyPool,
  streamWirer: SessionStreamWirer,
  memoryInjector?: MemoryInjector,
): Promise<void> {
  if (!session.ollamaModel) {
    const meta = await readWorktreeMeta(session.worktreePath)
    if (meta?.ollamaModel) {
      session.ollamaModel = meta.ollamaModel
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
): { sessionId: string } {
  const shell = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/zsh')
  const ptyHandle = ptyPool.spawn(shell, ['-il'], { cwd })
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
  }

  sessions.set(id, session)
  streamWirer.wireOutputStreaming(ptyHandle.id, session)
  streamWirer.wireExitHandling(ptyHandle.id, session)

  return { sessionId: id }
}
