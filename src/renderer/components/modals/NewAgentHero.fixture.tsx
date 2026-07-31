// Screenshot fixture for NewAgentHero — see scripts/screenshot-component.mjs.
// `npm run screenshot:component NewAgentHero --theme royal-dark` renders the wired hero.
// The default electronAPI stub resolves every invoke to []; here we override `runtimes:list`
// so the agent dropdown shows real options, and pass a dormant session so the capture
// includes the existing-worktrees list under the cards.
import React from 'react'
import type { AgentRuntime, AgentSession } from '../../../shared/types'
import { NewAgentHero } from './NewAgentHero'

const runtimes: AgentRuntime[] = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
  { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
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
    projectId="demo-project"
    projectName="vipps-backstage"
    projectPath="/Users/you/code/manifold"
    baseBranch="main"
    isGitProject
    defaultRuntime="claude"
    existingSessions={[dormantSession]}
    onLaunch={async () => undefined}
  />
)
