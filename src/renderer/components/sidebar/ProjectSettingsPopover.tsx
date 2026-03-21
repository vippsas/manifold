import React from 'react'
import type { Project } from '../../../shared/types'
import { createAnchoredPopoverStyles } from '../workbench-style-primitives'

interface ProjectSettingsPopoverProps {
  project: Project
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  onClose: () => void
}

const styles: Record<string, React.CSSProperties> = createAnchoredPopoverStyles('200px')

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
