// Screenshot fixture for the whole start view — wordmark, starfield and the
// new-agent cards as one unit, which NewAgentHero.fixture.tsx can't show alone.
// `npm run screenshot:component OnboardingView --theme royal-dark`
import React from 'react'
import type { AgentRuntime, AgentSession } from '../../../shared/types'
import { OnboardingView } from './OnboardingView'

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
  <OnboardingView
    variant="no-agent"
    projectId="demo-project"
    projectName="vipps-backstage"
    projectPath="/Users/you/code/manifold"
    baseBranch="main"
    isGitProject
    defaultRuntime="claude"
    defaultAgentMode="interactive"
    existingSessions={[dormantSession]}
    onLaunch={async () => undefined}
  />
)
