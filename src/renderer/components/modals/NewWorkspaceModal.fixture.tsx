import { NewWorkspaceModal } from './NewWorkspaceModal'

const projects = [
  { id: 'frontend', name: 'storefront', path: '/projects/storefront', baseBranch: 'main', addedAt: '2026-07-10' },
  { id: 'backend', name: 'commerce-api', path: '/projects/commerce-api', baseBranch: 'main', addedAt: '2026-07-11' },
]

export default (
  <NewWorkspaceModal
    visible
    projects={projects}
    defaultRuntime="codex"
    onAddProject={async () => null}
    onCreate={() => undefined}
    onClose={() => undefined}
  />
)
