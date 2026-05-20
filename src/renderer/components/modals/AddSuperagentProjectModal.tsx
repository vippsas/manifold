import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentSession, Project } from '../../../shared/types'
import type {
  Superagent,
  SuperagentProjectAddition,
} from '../../../shared/superagent-types'
import { sortProjectsByName } from '../../../shared/project-sort'
import * as s from './NewSuperagentModal.styles'

type AddMode = 'new-slot' | 'reuse-session'

interface ProjectSelectionState {
  loading: boolean
  standaloneCount: number
  compatibleSessions: AgentSession[]
  mode: AddMode
  reuseSessionId: string | null
}

interface AddSuperagentProjectModalProps {
  visible: boolean
  superagent: Superagent | null
  projects: Project[]
  projectError?: string | null
  onAddProject: () => Promise<Project | null>
  onResolveStandaloneSessions: (projectId: string) => Promise<AgentSession[]>
  onSelectionChange?: (projectIds: string[]) => void
  onAddToFleet: (superagentId: string, additions: SuperagentProjectAddition[]) => Promise<void>
  onClose: () => void
}

function pluralizeAgents(count: number): string {
  return count === 1 ? 'agent' : 'agents'
}

function dedupeSessionsByWorktree(sessions: AgentSession[]): AgentSession[] {
  const seen = new Set<string>()
  return sessions.filter((session) => {
    const key = `${session.worktreePath}:${session.branchName}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function AddSuperagentProjectModal({
  visible,
  superagent,
  projects,
  projectError,
  onAddProject,
  onResolveStandaloneSessions,
  onSelectionChange,
  onAddToFleet,
  onClose,
}: AddSuperagentProjectModalProps) {
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [selectionState, setSelectionState] = useState<Record<string, ProjectSelectionState>>({})
  const [addingProject, setAddingProject] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visible) {
      onSelectionChange?.([])
      return
    }
    setSelectedProjectIds([])
    setSelectionState({})
    setAddingProject(false)
    setSaving(false)
  }, [visible, superagent?.id, onSelectionChange])

  useEffect(() => {
    if (!visible) return
    onSelectionChange?.(selectedProjectIds)
  }, [visible, onSelectionChange, selectedProjectIds])

  const availableProjects = useMemo(() => sortProjectsByName(
    projects.filter((project) => !superagent?.fleetProjectIds.includes(project.id)),
  ), [projects, superagent?.fleetProjectIds])

  const ensureProjectSelectionState = useCallback(async (projectId: string): Promise<void> => {
    if (!superagent || selectionState[projectId]) return
    setSelectionState((current) => ({
      ...current,
      [projectId]: {
        loading: true,
        standaloneCount: 0,
        compatibleSessions: [],
        mode: 'new-slot',
        reuseSessionId: null,
      },
    }))

    const sessions = dedupeSessionsByWorktree(await onResolveStandaloneSessions(projectId))
    const compatibleSessions = sessions.filter(
      (session) => !session.noWorktree && session.branchName === superagent.branchName,
    )

    setSelectionState((current) => {
      const previous = current[projectId]
      if (!previous) return current
      return {
        ...current,
        [projectId]: {
          loading: false,
          standaloneCount: sessions.length,
          compatibleSessions,
          mode: previous.mode === 'reuse-session' && compatibleSessions.length > 0
            ? 'reuse-session'
            : 'new-slot',
          reuseSessionId: previous.reuseSessionId ?? compatibleSessions[0]?.id ?? null,
        },
      }
    })
  }, [onResolveStandaloneSessions, selectionState, superagent])

  const handleAddProject = async (): Promise<void> => {
    setAddingProject(true)
    try {
      const project = await onAddProject()
      if (!project) return
      if (superagent?.fleetProjectIds.includes(project.id)) return
      setSelectedProjectIds((current) => current.includes(project.id) ? current : [...current, project.id])
      void ensureProjectSelectionState(project.id)
    } finally {
      setAddingProject(false)
    }
  }

  const canSubmit = Boolean(superagent)
    && selectedProjectIds.length > 0
    && !saving
    && selectedProjectIds.every((projectId) => !selectionState[projectId]?.loading)

  if (!visible || !superagent) return null

  return (
    <div style={s.overlay} onClick={saving ? undefined : onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={s.title}>Add Repository to {superagent.name}</h2>

        <div style={s.field}>
          <div style={s.fieldHeader}>
            <label style={s.label}>Available repositories ({selectedProjectIds.length}/{availableProjects.length})</label>
            <button
              type="button"
              style={s.inlineButton}
              onClick={() => { void handleAddProject() }}
              disabled={addingProject || saving}
            >
              {addingProject ? 'Adding…' : '+ Add repository'}
            </button>
          </div>
          <div style={s.helperText}>
            Extend this superagent fleet without leaving the current session. Repositories stay standalone unless you explicitly reuse an existing compatible agent.
          </div>
          <div style={s.fleetList}>
            {availableProjects.length === 0 ? (
              <div style={s.emptyState}>No additional repositories available yet.</div>
            ) : (
              availableProjects.map((project) => {
                const isSelected = selectedProjectIds.includes(project.id)
                const projectState = selectionState[project.id]
                const compatibleSession = projectState?.compatibleSessions[0] ?? null
                const hasStandaloneSessions = (projectState?.standaloneCount ?? 0) > 0
                const hasCompatibleSession = Boolean(compatibleSession)
                const separateCount = Math.max(
                  (projectState?.standaloneCount ?? 0) - (projectState?.compatibleSessions.length ?? 0),
                  0,
                )

                return (
                  <label key={project.id} style={s.fleetRow}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProjectIds((current) => current.includes(project.id) ? current : [...current, project.id])
                          void ensureProjectSelectionState(project.id)
                          return
                        }
                        setSelectedProjectIds((current) => current.filter((id) => id !== project.id))
                      }}
                      disabled={saving}
                    />
                    <div style={s.fleetRowText}>
                      <span style={s.fleetName}>{project.name}</span>
                      <span style={s.fleetPath}>{project.path}</span>
                      {isSelected && projectState?.loading && (
                        <div style={s.selectionNote}>Checking for existing standalone agents…</div>
                      )}
                      {isSelected && !projectState?.loading && hasCompatibleSession && (
                        <div style={s.optionList}>
                          <label style={s.optionRow}>
                            <input
                              type="radio"
                              name={`reuse-mode-${project.id}`}
                              checked={projectState.mode === 'new-slot'}
                              onChange={() => {
                                setSelectionState((current) => {
                                  const previous = current[project.id]
                                  if (!previous) return current
                                  return {
                                    ...current,
                                    [project.id]: {
                                      ...previous,
                                      mode: 'new-slot',
                                    },
                                  }
                                })
                              }}
                              disabled={saving}
                            />
                            <span style={s.optionText}>
                              <span style={s.optionLabel}>Add as new superagent slot</span>
                              <span style={s.optionDetail}>Recommended. Keeps any existing standalone work separate.</span>
                            </span>
                          </label>
                          <label style={s.optionRow}>
                            <input
                              type="radio"
                              name={`reuse-mode-${project.id}`}
                              checked={projectState.mode === 'reuse-session'}
                              onChange={() => {
                                setSelectionState((current) => {
                                  const previous = current[project.id]
                                  if (!previous) return current
                                  return {
                                    ...current,
                                    [project.id]: {
                                      ...previous,
                                      mode: 'reuse-session',
                                      reuseSessionId: compatibleSession.id,
                                    },
                                  }
                                })
                              }}
                              disabled={saving}
                            />
                            <span style={s.optionText}>
                              <span style={s.optionLabel}>Reuse existing agent</span>
                              <span style={s.optionDetail}>
                                Adopt the existing {compatibleSession.branchName} agent into {superagent.name}.
                              </span>
                            </span>
                          </label>
                          {separateCount > 0 && (
                            <div style={s.selectionNote}>
                              {separateCount} other standalone {pluralizeAgents(separateCount)} on different branches will stay under With agents.
                            </div>
                          )}
                        </div>
                      )}
                      {isSelected && !projectState?.loading && hasStandaloneSessions && !hasCompatibleSession && (
                        <div style={s.selectionNote}>
                          {projectState.standaloneCount} existing standalone {pluralizeAgents(projectState.standaloneCount)} use different branches and will stay under With agents.
                        </div>
                      )}
                    </div>
                  </label>
                )
              })
            )}
          </div>
          {projectError && <div style={s.errorText}>{projectError}</div>}
        </div>

        <div style={s.actions}>
          <button
            type="button"
            style={s.secondaryButton}
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            style={{ ...s.primaryButton, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            disabled={!canSubmit}
            onClick={() => {
              if (!superagent || selectedProjectIds.length === 0) return
              setSaving(true)
              const additions = selectedProjectIds.map<SuperagentProjectAddition>((projectId) => ({
                projectId,
                reuseSessionId: selectionState[projectId]?.mode === 'reuse-session'
                  ? selectionState[projectId]?.reuseSessionId ?? undefined
                  : undefined,
              }))
              void onAddToFleet(superagent.id, additions)
                .then(() => onClose())
                .finally(() => setSaving(false))
            }}
          >
            {saving ? 'Adding…' : 'Add to superagent'}
          </button>
        </div>
      </div>
    </div>
  )
}
