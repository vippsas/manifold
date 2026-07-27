import { ProjectSidebar } from './ProjectSidebar'
import type { AgentSession, Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

const projects: Project[] = [
  { id: 'frontend', name: 'storefront', path: '/projects/storefront', baseBranch: 'main', addedAt: '2026-07-10' },
  { id: 'backend', name: 'commerce-api', path: '/projects/commerce-api', baseBranch: 'main', addedAt: '2026-07-11' },
  { id: 'docs', name: 'product-docs', path: '/projects/product-docs', baseBranch: 'main', addedAt: '2026-07-12' },
]

const workspace: Workspace = {
  id: 'checkout',
  name: 'Checkout redesign',
  projectIds: ['frontend', 'backend'],
  createdAt: '2026-07-13',
}

const workspaceSession: AgentSession = {
  id: 'session-1',
  projectId: 'frontend',
  workspaceId: workspace.id,
  runtimeId: 'codex',
  branchName: 'checkout/payment-flow',
  worktreePath: '/worktrees/payment-flow',
  status: 'running',
  pid: 42,
  additionalDirs: ['/worktrees/commerce-api'],
}

const docsSession: AgentSession = {
  id: 'session-2',
  projectId: 'docs',
  runtimeId: 'claude',
  branchName: 'docs/navigation',
  worktreePath: '/worktrees/docs-navigation',
  status: 'waiting',
  pid: 43,
  additionalDirs: [],
}

export default (
  <div style={{ width: 320, height: 720, background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}>
    <ProjectSidebar
      projects={projects}
      activeProjectId="frontend"
      suppressedProjectIds={new Set(['frontend', 'backend'])}
      allProjectSessions={{ frontend: [workspaceSession], backend: [], docs: [docsSession] }}
      activeSessionId={workspaceSession.id}
      outputtingSessionIds={new Set([workspaceSession.id])}
      onSelectProject={() => undefined}
      onSelectSession={() => undefined}
      onRemoveProject={() => undefined}
      onUpdateProject={() => undefined}
      onRenameAgent={() => undefined}
      onRequestDeleteAgent={() => undefined}
      onNewAgent={() => undefined}
      onNewProject={() => undefined}
      onCreateWorkspaceFromProject={async () => undefined}
      onNewWorkspace={() => undefined}
      workspaces={[workspace]}
      activeWorkspaceId={workspace.id}
      sessionsByWorkspace={{ [workspace.id]: [workspaceSession] }}
      onSelectWorkspace={() => undefined}
      onRemoveWorkspace={async () => undefined}
      onSelectWorkspaceRepo={() => undefined}
      onAddProjectToWorkspace={() => undefined}
      onRemoveProjectFromWorkspace={() => undefined}
      drafts={[]}
      activeDraftId={null}
      onSelectDraft={() => undefined}
      onDiscardDraft={() => undefined}
    />
  </div>
)
