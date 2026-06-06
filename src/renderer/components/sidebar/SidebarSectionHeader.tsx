import type React from 'react'
import { sidebarStyles } from './ProjectSidebar.styles'

interface SidebarSectionHeaderProps {
  label: string
  count?: number
  expanded: boolean
  onToggle: () => void
  action?: React.ReactNode
}

export function SidebarSectionHeader({
  label,
  count,
  expanded,
  onToggle,
  action,
}: SidebarSectionHeaderProps): React.JSX.Element {
  const button = (
    <button
      type="button"
      style={action
        ? { ...sidebarStyles.sectionLabelToggle, ...sidebarStyles.sectionHeaderToggle }
        : sidebarStyles.sectionLabelToggle}
      onClick={onToggle}
      aria-expanded={expanded}
      title={expanded ? `Collapse ${label}` : `Expand ${label}`}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        style={{
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform var(--duration-normal) var(--ease-premium)',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        <path d="M3 1L7 5L3 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{label}</span>
      {count !== undefined && <span style={sidebarStyles.sectionCount}>{count}</span>}
    </button>
  )

  if (action) {
    return (
      <div style={sidebarStyles.sectionHeader}>
        {button}
        {action}
      </div>
    )
  }

  return button
}
