import { useEffect, useMemo, useState } from 'react'
import type { AgentRuntime, Project } from '../../../shared/types'
import type { WorkspaceCreateOptions } from '../../../shared/workspace-types'
import { styles as s } from './NewWorkspaceModal.styles'

export interface NewWorkspaceModalProps {
  visible: boolean
  projects: Project[]
  projectError?: string | null
  defaultRuntime: string
  onAddProject: () => Promise<Project | null>
  onCreate: (options: WorkspaceCreateOptions) => void
  onClose: () => void
}

export function NewWorkspaceModal({ visible, projects, projectError, defaultRuntime, onAddProject, onCreate, onClose }: NewWorkspaceModalProps) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [addingProject, setAddingProject] = useState(false)
  const [runtimeId, setRuntimeId] = useState(defaultRuntime)
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([])

  const sortedProjects = useMemo(() => [...projects].sort((a, b) => a.name.localeCompare(b.name)), [projects])

  useEffect(() => {
    if (!visible) return
    setName('')
    setSelected([])
    setRuntimeId(defaultRuntime)
    void window.electronAPI.invoke('runtimes:list').then((list) => setRuntimes(list as AgentRuntime[]))
  }, [visible, defaultRuntime])

  const canSubmit = name.trim().length > 0 && selected.length > 0

  const handleAddProject = async (): Promise<void> => {
    setAddingProject(true)
    try {
      const added = await onAddProject()
      if (added) setSelected((prev) => (prev.includes(added.id) ? prev : [...prev, added.id]))
    } finally {
      setAddingProject(false)
    }
  }

  if (!visible) return null

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={s.title}>New Workspace</h2>

        <div style={s.field}>
          <label style={s.label}>Name</label>
          <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. cross-repo auth rename" />
        </div>

        <div style={s.field}>
          <label style={s.label}>Runtime</label>
          <select style={s.input} value={runtimeId} onChange={(e) => setRuntimeId(e.target.value)}>
            {runtimes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name}{rt.installed === false ? ' (not installed)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={s.field}>
          <div style={s.fieldHeader}>
            <label style={s.label}>Projects ({selected.length}/{sortedProjects.length})</label>
            <button type="button" style={s.inlineButton} onClick={() => { void handleAddProject() }} disabled={addingProject}>
              {addingProject ? 'Adding…' : '+ Add repository'}
            </button>
          </div>
          <div style={s.fleetList}>
            {sortedProjects.length === 0 ? (
              <div style={s.emptyState}>No repositories in Manifold yet.</div>
            ) : (
              sortedProjects.map((p) => (
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
          {projectError && <div style={s.errorText}>{projectError}</div>}
        </div>

        <div style={s.actions}>
          <button style={s.secondaryButton} onClick={onClose}>Cancel</button>
          <button
            style={{ ...s.primaryButton, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            disabled={!canSubmit}
            onClick={() => onCreate({ name, projectIds: selected, runtimeId })}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
