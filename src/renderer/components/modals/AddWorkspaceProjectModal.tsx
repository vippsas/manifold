import { useEffect, useMemo, useState } from 'react'
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { styles as s } from './NewWorkspaceModal.styles'

export interface AddWorkspaceProjectModalProps {
  visible: boolean
  workspace: Workspace | null
  projects: Project[]
  onAdd: (workspaceId: string, projectIds: string[]) => void | Promise<void>
  onClose: () => void
}

export function AddWorkspaceProjectModal({ visible, workspace, projects, onAdd, onClose }: AddWorkspaceProjectModalProps) {
  const [selected, setSelected] = useState<string[]>([])
  const available = useMemo(
    () => projects
      .filter((p) => !workspace?.projectIds.includes(p.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [projects, workspace],
  )
  useEffect(() => { if (visible) setSelected([]) }, [visible, workspace?.id])

  if (!visible || !workspace) return null
  const canSubmit = selected.length > 0

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={s.title}>Add repositories to {workspace.name}</h2>
        <div style={s.field}>
          <label style={s.label}>Projects ({selected.length} selected)</label>
          <div style={s.fleetList}>
            {available.length === 0 ? (
              <div style={s.emptyState}>All repositories are already in this workspace.</div>
            ) : (
              available.map((p) => (
                <label key={p.id} style={s.fleetRow}>
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))}
                  />
                  <div style={s.fleetRowText}>
                    <span style={s.fleetName}>{p.name}</span>
                    <span style={s.fleetPath}>{p.path}</span>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>
        <div style={s.actions}>
          <button style={s.secondaryButton} onClick={onClose}>Cancel</button>
          <button
            style={{ ...s.primaryButton, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            disabled={!canSubmit}
            onClick={() => onAdd(workspace.id, selected)}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
