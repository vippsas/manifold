// resources/plugins/manifold.loop/src/plugin.ts
import type { ManifoldContext, CancellationToken } from 'manifold'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifold = require('manifold') as typeof import('manifold')

import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import type { LoopConfig } from './types'
import { LoopEngine, type RunTurn } from './engine'
import { createGitAdapter } from './git'
import { createEvalRunner } from './eval-runner'
import { createJudge } from './judge'
import { createLoopStore } from './store'
import { appendIteration, readAllIterations, clearIterations } from './iteration-log'
import { createWebviewHost } from './webview-host'
import { buildImproveInstruction } from './improve-instruction'

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
    // No agent means the loop genuinely can't proceed — surface it as an error rather than
    // 'aborted', which the engine logs as "stopped by user" (misleading and non-actionable).
    if (!agent) throw new Error('no active agent session')
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

  const host = createWebviewHost({
    engine,
    readBundle: () => readFileSync(join(context.pluginUri, 'out', 'webview.js'), 'utf8'),
    getActiveSessionId: () => manifold.agents.activeAgent?.sessionId ?? null,
    confirmClear: async () => (await manifold.window.showWarningMessage('Clear all iteration history for this loop? This cannot be undone.', 'Clear')) === 'Clear',
    improveWithAi: async (args) => {
      const models = await manifold.lm.selectChatModels()
      const model = models[0]
      if (!model) throw new Error('no language model available — is a default runtime configured?')
      const res = await model.sendRequest(buildImproveInstruction(args))
      return res.text
    },
  })
  engine.setEmit(host.emit)
  context.subscriptions.push(manifold.window.registerWebviewViewProvider('manifold.loop.panel', host.provider))
  context.subscriptions.push(manifold.workspace.onDidChangeActiveSession(() => host.refresh()))

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
