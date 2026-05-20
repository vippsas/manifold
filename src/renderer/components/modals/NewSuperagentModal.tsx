import { useEffect, useState } from 'react'
import type { AgentRuntime, Project } from '../../../shared/types'
import type { SuperagentCreateOptions } from '../../../shared/superagent-types'
import { sortProjectsByName } from '../../../shared/project-sort'
import * as s from './NewSuperagentModal.styles'

export interface NewSuperagentModalProps {
  visible: boolean
  projects: Project[]
  defaultRuntime: string
  projectError?: string | null
  onAddProject: () => Promise<Project | null>
  onLaunch: (options: SuperagentCreateOptions) => void
  onClose: () => void
}

export function NewSuperagentModal({
  visible,
  projects,
  defaultRuntime,
  projectError,
  onAddProject,
  onLaunch,
  onClose,
}: NewSuperagentModalProps) {
  const [name, setName] = useState('')
  const [fleet, setFleet] = useState<string[]>([])
  const [runtimeId, setRuntimeId] = useState(defaultRuntime)
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([])
  const [addingProject, setAddingProject] = useState(false)

  useEffect(() => {
    if (!visible) return
    void window.electronAPI.invoke('runtimes:list').then((list) => {
      const supported = (list as AgentRuntime[]).filter((rt) => rt.orchestratorCapable)
      setRuntimes(supported)
      setRuntimeId((current) => {
        if (supported.some((rt) => rt.id === current)) return current
        return supported[0]?.id ?? ''
      })
    })
  }, [visible])

  useEffect(() => {
    setRuntimeId(defaultRuntime)
  }, [defaultRuntime])

  useEffect(() => {
    if (!visible) return
    setName('')
    setFleet([])
    setRuntimeId(defaultRuntime)
  }, [defaultRuntime, visible])

  const sortedProjects = sortProjectsByName(projects)

  const handleAddProject = async (): Promise<void> => {
    setAddingProject(true)
    try {
      const project = await onAddProject()
      if (!project) return
      setFleet((prev) => (prev.includes(project.id) ? prev : [...prev, project.id]))
    } finally {
      setAddingProject(false)
    }
  }

  const canSubmit = name.trim().length > 0 && fleet.length > 0 && runtimeId.length > 0
  const selectedFleetProjectIds = sortedProjects
    .filter((project) => fleet.includes(project.id))
    .map((project) => project.id)

  if (!visible) return null

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={s.title}>New Superagent</h2>

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
            <label style={s.label}>Fleet ({fleet.length}/{sortedProjects.length})</label>
            <button
              type="button"
              style={s.inlineButton}
              onClick={() => { void handleAddProject() }}
              disabled={addingProject}
            >
              {addingProject ? 'Adding…' : '+ Add repository'}
            </button>
          </div>
          <div style={s.helperText}>
            Add an existing local repository to Manifold without leaving this dialog.
          </div>
          <div style={s.fleetList}>
            {sortedProjects.length === 0 ? (
              <div style={s.emptyState}>No repositories in Manifold yet.</div>
            ) : (
              sortedProjects.map((p) => (
                <label key={p.id} style={s.fleetRow}>
                  <input
                    type="checkbox"
                    checked={fleet.includes(p.id)}
                    onChange={(e) =>
                      setFleet((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))
                    }
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
            onClick={() => onLaunch({ name, taskDescription: '', runtimeId, fleetProjectIds: selectedFleetProjectIds, initialPrompt: '' })}
          >
            Launch
          </button>
        </div>
      </div>
    </div>
  )
}
