// Screenshot fixture for NewAgentForm — see scripts/screenshot-component.mjs.
// `npm run screenshot:component NewAgentForm --theme manifold-dark` renders this wired form.
// The default electronAPI stub resolves every invoke to []; here we override `runtimes:list`
// so the runtime tiles show real options in the capture.
import React from 'react'
import type { AgentRuntime } from '../../../shared/types'
import { NewAgentForm } from './NewAgentForm'

const runtimes: AgentRuntime[] = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
  { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
  { id: 'copilot', name: 'Copilot', binary: 'copilot', installed: true },
  { id: 'gemini', name: 'Gemini CLI', binary: 'gemini', installed: false },
  { id: 'viola', name: 'Viola', binary: '', kind: 'orchestrator', installed: true },
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
    workspaceName="Checkout redesign"
    primaryPath="/Users/you/code/manifold"
    defaultRuntime="claude"
    onLaunch={async () => undefined}
  />
)
