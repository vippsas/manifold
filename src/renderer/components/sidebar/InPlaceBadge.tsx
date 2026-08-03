import React from 'react'

/** Marks an agent that works in a repository's own checkout instead of a
 *  worktree of its own.
 *
 *  It appears twice on purpose: on the agent's row, saying what the agent is,
 *  and on the folder row it has checked out, naming the branch — that folder is
 *  where the agent's edits land, so the folder row is where a reader looks for
 *  them. A worktree agent's edits land under its own row instead. */
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
