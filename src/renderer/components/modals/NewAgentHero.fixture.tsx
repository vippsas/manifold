// Screenshot fixture for NewAgentHero — see scripts/screenshot-component.mjs.
// `npm run screenshot:component NewAgentHero --theme manifold-dark` renders the wired hero.
// The default electronAPI stub resolves every invoke to []; here we override `runtimes:list`
// so the agent dropdown shows real options, and pass a dormant session so the capture
// includes the existing-worktrees list under the cards.
import React from 'react'
import type { AgentRuntime, AgentSession } from '../../../shared/types'
import { NewAgentHero } from './NewAgentHero'

const runtimes: AgentRuntime[] = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
  { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
  { id: 'viola', name: 'Viola', binary: '', kind: 'orchestrator', installed: true },
]

const dormantSession = {
  id: 'session-dormant',
  projectId: 'demo-project',
  runtimeId: 'claude',
  branchName: 'manifold/reticle-input',
  worktreePath: '/Users/you/code/manifold/.manifold/worktrees/reticle-input',
  status: 'done',
  pid: null,
  taskDescription: 'Polish the reticle input brackets',
  additionalDirs: [],
} as unknown as AgentSession

const baseStub = window.electronAPI
window.electronAPI = {
  ...baseStub,
  invoke: (channel: string, ...args: unknown[]) => {
    if (channel === 'runtimes:list') return Promise.resolve(runtimes)
    return baseStub.invoke(channel, ...args)
  },
}

export default (
  <NewAgentHero
    workspaceName="Checkout redesign"
    primaryPath="/Users/you/code/manifold"
    branchLabel="checkout-redesign"
    defaultRuntime="claude"
    existingSessions={[dormantSession]}
    onLaunch={async () => undefined}
  />
)
