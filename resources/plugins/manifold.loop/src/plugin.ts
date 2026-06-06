// resources/plugins/manifold.loop/src/plugin.ts
import type { ManifoldContext, CancellationToken } from 'manifold'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifold = require('manifold') as typeof import('manifold')

import type { LoopConfig } from './types'
import { LoopEngine, type RunTurn } from './engine'
import { createGitAdapter } from './git'
import { createEvalRunner } from './eval-runner'
import { createJudge } from './judge'
import { createLoopStore } from './store'
import { appendIteration, readAllIterations, clearIterations } from './iteration-log'

/** Bridge an AbortSignal to a manifold CancellationToken for agents.runTurn. */
function tokenFromSignal(signal: AbortSignal): CancellationToken {
  return {
    get isCancellationRequested() { return signal.aborted },
    onCancellationRequested(listener: () => void) {
      if (signal.aborted) { listener(); return { dispose() {} } }
      signal.addEventListener('abort', listener, { once: true })
      return { dispose: () => signal.removeEventListener('abort', listener) }
    },
  }
}

export function activate(context: ManifoldContext): void {
  const runTurn: RunTurn = async (prompt, opts, signal) => {
    const agent = manifold.agents.activeAgent
    if (!agent) return 'aborted'
    return agent.runTurn(prompt, { budgetSeconds: opts.budgetSeconds, clearContext: opts.clearContext }, tokenFromSignal(signal))
  }

  const engine = new LoopEngine({
    git: createGitAdapter(),
    evalRunner: createEvalRunner(),
    judge: createJudge(manifold.lm),
    iterationLog: { append: appendIteration, readAll: readAllIterations, clear: clearIterations },
    runTurn,
    activeSessionId: () => manifold.agents.activeAgent?.sessionId,
    worktreePath: () => manifold.workspace.workspaceFolders?.[0]?.uri,
    store: createLoopStore(manifold.storage),
  })

  const reg = (id: string, handler: (...args: never[]) => unknown): void => {
    context.subscriptions.push(manifold.commands.registerCommand(id, handler as (...a: unknown[]) => unknown))
  }

  reg('manifold.loop.start', (config: LoopConfig) => {
    void engine.start(config).catch((err) => { console.error('[loop-plugin] run failed:', err) })
    return engine.getStatusSync(config.sessionId) ?? { sessionId: config.sessionId, state: 'running', currentIteration: 0 }
  })
  reg('manifold.loop.stop', (sessionId: string) => engine.stop(sessionId).then(() => engine.getStatus(sessionId)))
  reg('manifold.loop.status', (sessionId: string) => engine.getStatus(sessionId))
  reg('manifold.loop.iterations', () => engine.getIterations())
  reg('manifold.loop.clear', (sessionId: string) => engine.clear(sessionId))
  reg('manifold.loop.restoreBest', (sessionId: string) => engine.restoreBest(sessionId))
  reg('manifold.loop.setConfig', (sessionId: string, config: LoopConfig) => engine.setConfig(sessionId, config))
}

export function deactivate(): void {}
