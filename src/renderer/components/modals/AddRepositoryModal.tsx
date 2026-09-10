import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CreateProjectOptions } from '../../../shared/types'
import { LocalRepoGlyph, NewProjectGlyph, NoProjectActions, PathCard } from '../sidebar/NoProjectActions'
import { addRepositoryModalStyles as s } from './AddRepositoryModal.styles'

interface AddRepositoryModalProps {
  visible: boolean
  currentWorkspace?: { id: string; name: string }
  onAddProject: (workspaceId?: string) => void
  onCloneProject: (url: string, workspaceId?: string) => Promise<boolean>
  onCreateNewProject: (options: CreateProjectOptions, workspaceId?: string) => Promise<boolean>
  creatingProject: boolean
  cloningProject: boolean
  createError: string | null
  onClose: () => void
}

export function AddRepositoryModal({
  visible,
  currentWorkspace,
  onAddProject,
  onCloneProject,
  onCreateNewProject,
  creatingProject,
  cloningProject,
  createError,
  onClose,
}: AddRepositoryModalProps): React.JSX.Element | null {
  const [destination, setDestination] = useState<'current' | 'new' | null>(null)
  useEffect(() => { if (visible) setDestination(null) }, [visible])
  const workspaceId = destination === 'current' ? currentWorkspace?.id : undefined
  const busy = creatingProject || cloningProject
  if (!visible) return null

  return createPortal(
    <div
      style={s.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-repository-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
      onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}
    >
      <div style={s.panel}>
        <div style={s.header}>
          <h2 id="add-repository-title" style={s.title}>New Repo</h2>
          <button type="button" style={s.closeButton} onClick={onClose} aria-label="Close add repository dialog">&times;</button>
        </div>
        <div style={s.body}>
          {destination === null ? (
            <>
              <h3 style={s.destinationHeading}>Where should this repository go?</h3>
              <div style={s.destinationCards}>
                <PathCard
                  glyph={<LocalRepoGlyph />}
                  title="Current workspace"
                  subtitle={currentWorkspace?.name ?? 'No workspace is open'}
                  disabled={!currentWorkspace || busy}
                  onClick={() => setDestination('current')}
                />
                <PathCard
                  glyph={<NewProjectGlyph />}
                  title="New workspace"
                  subtitle="Start a separate workspace for this repository"
                  disabled={busy}
                  onClick={() => setDestination('new')}
                />
              </div>
            </>
          ) : (
            <>
              <div style={s.destinationSummary}>
                <button type="button" style={s.backButton} disabled={busy} onClick={() => setDestination(null)} aria-label="Change workspace">← Back</button>
                <span style={s.destinationName}>{workspaceId ? currentWorkspace?.name : 'New workspace'}</span>
              </div>
              <NoProjectActions
                onAddProject={() => onAddProject(workspaceId)}
                onCloneProject={(url) => onCloneProject(url, workspaceId)}
                onCreateNewProject={(options) => onCreateNewProject(options, workspaceId)}
                creatingProject={creatingProject}
                cloningProject={cloningProject}
                createError={createError}
              />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
