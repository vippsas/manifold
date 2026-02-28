import React from 'react'
import type { Project } from '../../../shared/types'

interface ProjectSettingsPopoverProps {
  project: Project
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  onClose: () => void
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 999,
  },
  popover: {
    position: 'absolute',
    right: 0,
    top: '100%',
    marginTop: '4px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '10px 12px',
    zIndex: 1000,
    minWidth: '200px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  header: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
}

export function ProjectSettingsPopover({
  project,
  onUpdateProject,
  onClose,
}: ProjectSettingsPopoverProps): React.JSX.Element {
  const autoGenerate = project.autoGenerateMessages !== false

  const handleToggle = (): void => {
    onUpdateProject(project.id, { autoGenerateMessages: !autoGenerate })
  }

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.popover}>
        <div style={styles.header}>{project.name}</div>
        <label style={styles.label}>
          <input
            type="checkbox"
            checked={autoGenerate}
            onChange={handleToggle}
          />
          Auto-generate AI messages
        </label>
      </div>
    </>
  )
}
