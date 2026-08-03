import React from 'react'
import type { AgentRuntime, Project } from '../../../shared/types'
import { NewAgentModal } from './NewAgentModal'

const runtimes: AgentRuntime[] = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
  { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
]
const project: Project = {
  id: 'storefront',
  name: 'storefront',
  path: '/projects/storefront',
  baseBranch: 'main',
  addedAt: '2026-07-13',
}

const baseStub = window.electronAPI
window.electronAPI = {
  ...baseStub,
  invoke: (channel: string, ...args: unknown[]) => {
    if (channel === 'runtimes:list') return Promise.resolve(runtimes)
    return baseStub.invoke(channel, ...args)
  },
}

export default (
  <NewAgentModal
    visible
    project={project}
    workspace={{ id: 'checkout', name: 'Checkout redesign', projectIds: [project.id], createdAt: '2026-07-13' }}
    existingSessions={[]}
    defaultRuntime="claude"
    defaultAgentMode="interactive"
    onLaunch={async () => undefined}
    onResumeSession={async () => undefined}
    onDeleteSession={() => undefined}
    onClose={() => undefined}
  />
)
