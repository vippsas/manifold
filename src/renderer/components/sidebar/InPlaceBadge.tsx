import React from 'react'

/** Names the branch a folder has checked out, on its sidebar row.
 *
 *  Only home workspaces use it: they *are* the clones, so each folder sits on
 *  its own branch. A worktree workspace puts every folder on one branch, named
 *  once on the workspace card. It says nothing about agents — they belong to
 *  the workspace, not to a folder. */
export function InPlaceBadge({ label, description }: { label: string; description: string }): React.JSX.Element {
  return (
    <span
      className="sidebar-agent-inplace-badge"
      aria-label={description}
      title={description}
      style={{
        flexShrink: 0,
        marginLeft: 6,
        marginRight: 6,
        padding: '1px 6px',
        fontSize: 'var(--type-ui-micro)',
        lineHeight: 1.5,
        color: 'var(--accent)',
        background: 'var(--accent-subtle)',
        border: '1px solid var(--accent-dim, var(--accent))',
        borderRadius: 'var(--radius-pill)',
        letterSpacing: '0.2px',
      }}
    >
      {label}
    </span>
  )
}
