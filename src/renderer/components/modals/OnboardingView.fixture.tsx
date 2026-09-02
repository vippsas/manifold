// Screenshot fixture for the whole start view — wordmark, starfield and the
// new-agent cards as one unit, which NewAgentHero.fixture.tsx can't show alone.
// `npm run screenshot:component OnboardingView --theme manifold-dark`
import React from 'react'
import type { AgentRuntime, AgentSession } from '../../../shared/types'
import { OnboardingView } from './OnboardingView'

const runtimes: AgentRuntime[] = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
  { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
  { id: 'copilot', name: 'Copilot', binary: 'copilot', installed: true },
  { id: 'gemini', name: 'Gemini CLI', binary: 'gemini', installed: false },
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
  <OnboardingView
    variant="no-agent"
    workspaceName="Checkout redesign"
    primaryPath="/Users/you/code/manifold"
    branchLabel="manifold/checkout-redesign"
    defaultRuntime="claude"
    defaultAgentMode="interactive"
    existingSessions={[dormantSession]}
    onLaunch={async () => undefined}
  />
)
