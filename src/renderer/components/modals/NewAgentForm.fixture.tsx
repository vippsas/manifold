// Screenshot fixture for NewAgentForm — see scripts/screenshot-component.mjs.
// `npm run screenshot:component NewAgentForm --theme royal-dark` renders this wired form.
// The default electronAPI stub resolves every invoke to []; here we override `runtimes:list`
// so the agent dropdown shows real options in the capture.
import React from 'react'
import type { AgentRuntime } from '../../../shared/types'
import { NewAgentForm } from './NewAgentForm'

const runtimes: AgentRuntime[] = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
  { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
]

const baseStub = window.electronAPI
window.electronAPI = {
  ...baseStub,
  invoke: (channel: string, ...args: unknown[]) => {
    if (channel === 'runtimes:list') return Promise.resolve(runtimes)
    return baseStub.invoke(channel, ...args)
  },
}

export default (
  <NewAgentForm
    projectId="demo-project"
    projectPath="/Users/you/code/manifold"
    baseBranch="main"
    isGitProject
    defaultRuntime="claude"
    onLaunch={async () => undefined}
  />
)
