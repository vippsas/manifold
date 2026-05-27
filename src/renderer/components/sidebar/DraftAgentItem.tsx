import React, { useCallback } from 'react'
import type { DraftChat } from '../../../shared/draft-chat'
import { sidebarStyles } from './ProjectSidebar.styles'

interface DraftAgentItemProps {
  draft: DraftChat
  isActive: boolean
  onSelect: (id: string) => void
  onDiscard: (id: string) => void
}

export function DraftAgentItem({ draft, isActive, onSelect, onDiscard }: DraftAgentItemProps): React.JSX.Element {
  const handleClick = useCallback(() => onSelect(draft.id), [onSelect, draft.id])
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect(draft.id)
      }
    },
    [onSelect, draft.id],
  )
  const handleDelete = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation()
      onDiscard(draft.id)
    },
    [onDiscard, draft.id],
  )

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`sidebar-item-row sidebar-agent-row sidebar-agent-row--alive${isActive ? ' sidebar-item-row--active' : ''}`}
      title="Draft chat"
      role="button"
      tabIndex={0}
    >
      <div className="sidebar-agent-main">
        <span className="status-dot status-dot--hidden" />
        <span
          aria-label="Chat agent"
          title="Chat agent"
          style={{ marginRight: 4, opacity: 0.8, fontSize: 11 }}
        >
          ◐
        </span>
        <span
          className="truncate sidebar-row-label"
          style={{
            ...sidebarStyles.agentBranch,
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: isActive ? 600 : 400,
            fontStyle: 'italic',
            flex: 1,
          }}
        >
          New chat
        </span>
        <div className="sidebar-item-actions">
          <button
            type="button"
            onClick={handleDelete}
            className="sidebar-icon-button"
            style={sidebarStyles.agentDeleteButton}
            aria-label={`Discard draft ${draft.id}`}
            title="Discard draft"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  )
}
