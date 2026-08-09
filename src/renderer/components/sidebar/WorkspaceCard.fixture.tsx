import React, { useState } from 'react'
import type { AgentSession, Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { WorkspaceCard } from './WorkspaceCard'
import { DockStateContext, type DockAppState } from '../editor/editor-shell/dock-panel-types'

// The card reads the dock for the one menu item that is not a row prop —
// favoriting. In the app the provider wraps the whole dock (AppShell.tsx), so a
// fixture without one would show a shorter menu than any user ever sees.
const dock = {
  favorites: [],
  isFavorite: () => false,
  onToggleFavorite: () => undefined,
  onReorderFavorites: () => undefined,
  onActivateFavorite: () => undefined,
} as unknown as DockAppState

const projects: Project[] = [
  { id: 'p1', name: 'manifold', path: '/repos/manifold', baseBranch: 'main', addedAt: '2024-01-01' },
]

// A worktree workspace, so the row carries the branch glyph and the repo prefix
// — the exact row shape the action cluster was hard to read on.
const workspace: Workspace = {
  id: 'w1',
  name: 'better buttons',
  projectIds: ['p1'],
  createdAt: '2024-01-01',
  branchName: 'manifold/better-buttons',
  worktreePaths: { p1: '/wt/better-buttons' },
}

// One agent, so the card can be shown mid-work: the dot pulses and the sweep
// runs along the name. That state is the one where the row's dimming has to
// survive — the sweep repaints text the segments would otherwise colour
// themselves.
const session = { id: 's1', projectId: 'p1' } as unknown as AgentSession

const noop = (): void => undefined

function Card({ working = false }: { working?: boolean } = {}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  return (
    <WorkspaceCard
      workspace={workspace}
      projects={projects}
      isActive
      expanded={expanded}
      onToggleExpanded={() => setExpanded((v) => !v)}
      sessions={working ? [session] : []}
      outputtingSessionIds={working ? new Set(['s1']) : undefined}
      drafts={[]}
      activeDraftId={null}
      onSelectWorkspace={noop}
      onRenameWorkspace={noop}
      onRemoveWorkspace={noop}
      onCopyWorkspace={noop}
      onAddProject={noop}
      onSelectDraft={noop}
      onDiscardDraft={noop}
    />
  )
}

function Panel({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--type-ui-caption)' }}>{label}</span>
      {children}
    </div>
  )
}

/**
 * The workspace row at rest and with its actions showing.
 *
 * The cluster is `opacity: 0` until the row is hovered, so a still capture can
 * only show it by forcing the hover state — the same trick
 * `RepoFetchButton.fixture.tsx` uses. Open this with `--emit-html` in a real
 * browser to exercise the parts a still cannot carry: the tooltip's 250ms rest,
 * and the worded menu the `+` opens.
 */
function WorkspaceCardFixture(): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        width: 340,
        padding: 20,
        background: 'var(--bg-sidebar)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--type-ui)',
      }}
    >
      <style>{'.fixture-hovered .sidebar-item-actions { opacity: 0.95; pointer-events: auto; }'}</style>
      <Panel label="at rest"><Card /></Panel>
      <Panel label="working — the repo and its “/” stay dimmed under the sweep">
        <Card working />
      </Panel>
      <Panel label="hovered — one ⋯ for every action">
        <div className="fixture-hovered"><Card /></div>
      </Panel>
    </div>
  )
}

export default function WrappedWorkspaceCardFixture(): React.JSX.Element {
  return (
    <DockStateContext.Provider value={dock}>
      <WorkspaceCardFixture />
    </DockStateContext.Provider>
  )
}
