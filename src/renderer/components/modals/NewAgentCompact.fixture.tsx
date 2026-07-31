// Screenshot fixture for the compact New Agent form — the variant shown in a
// workspace, where the runtime is picked from tiles rather than the Advanced
// dropdown. `npm run screenshot:component NewAgentCompact`.
import React from 'react'
import type { AgentRuntime } from '../../../shared/types'
import { NewAgentForm } from './NewAgentForm'

const runtimes: AgentRuntime[] = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
  { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
  { id: 'copilot', name: 'Copilot', binary: 'copilot', installed: true },
  { id: 'gemini', name: 'Gemini CLI', binary: 'gemini', installed: false },
  { id: 'ollama-claude', name: 'Claude Code (Ollama)', binary: 'ollama', installed: true, needsModel: true },
  { id: 'ollama-codex', name: 'Codex (Ollama)', binary: 'ollama', installed: true, needsModel: true },
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
  <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-xl)' }}>
    <NewAgentForm
      projectId="demo-project"
      projectPath="/Users/you/code/manifold"
      baseBranch="main"
      isGitProject
      compact
      defaultRuntime="claude"
      defaultAgentMode="chat"
      onLaunch={async () => undefined}
    />
  </div>
)
