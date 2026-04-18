import React, { useMemo } from 'react'
import type { Superagent } from '../../../shared/superagent-types'
import type { FileChange, Project } from '../../../shared/types'
import { useSuperagentFleetChanges } from '../../hooks/useSuperagentFleetChanges'
import { ModifiedFiles } from './ModifiedFiles'

interface FleetModifiedFilesProps {
  superagent: Superagent
  projects: Project[]
  activeFilePath: string | null
  onSelectFile: (absolutePath: string) => void
}

interface FleetSection {
  label: string
  worktreeRoot: string
  changes: FileChange[]
}

export function FleetModifiedFiles({
  superagent,
  projects,
  activeFilePath,
  onSelectFile,
}: FleetModifiedFilesProps): React.JSX.Element {
  const fleetChanges = useSuperagentFleetChanges(superagent.id)

  const sections = useMemo<FleetSection[]>(() => {
    return superagent.fleetProjectIds
      .map((projectId) => {
        const project = projects.find((p) => p.id === projectId)
        const worktreeRoot =
          superagent.fleetWorktreePaths?.[projectId] ?? project?.path ?? null
        if (!worktreeRoot) return null
        return {
          label: project?.name ?? projectId,
          worktreeRoot,
          changes: fleetChanges[worktreeRoot] ?? [],
        }
      })
      .filter((s): s is FleetSection => s !== null)
  }, [superagent.fleetProjectIds, superagent.fleetWorktreePaths, projects, fleetChanges])

  const hasAnyChanges = sections.some((s) => s.changes.length > 0)

  if (!hasAnyChanges) {
    return <div style={styles.empty}>No changes</div>
  }

  return (
    <div style={styles.wrapper}>
      {sections.map((section) =>
        section.changes.length === 0 ? null : (
          <div key={section.worktreeRoot} style={styles.section}>
            <div style={styles.sectionHeader}>{section.label}</div>
            <ModifiedFiles
              changes={section.changes}
              activeFilePath={activeFilePath}
              worktreeRoot={section.worktreeRoot}
              onSelectFile={onSelectFile}
            />
          </div>
        ),
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'auto',
    background: 'var(--bg-primary)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    borderBottom: '1px solid var(--border)',
  },
  sectionHeader: {
    padding: '4px 8px',
    fontSize: 11,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    background: 'var(--bg-secondary)',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: 12,
  },
}
