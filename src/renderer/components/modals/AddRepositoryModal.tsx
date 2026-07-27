import { createPortal } from 'react-dom'
import type { CreateProjectOptions } from '../../../shared/types'
import { NoProjectActions } from '../sidebar/NoProjectActions'
import { addRepositoryModalStyles as s } from './AddRepositoryModal.styles'

interface AddRepositoryModalProps {
  visible: boolean
  onAddProject: () => void
  onCloneProject: (url: string) => Promise<boolean>
  onCreateNewProject: (options: CreateProjectOptions) => Promise<boolean>
  creatingProject: boolean
  cloningProject: boolean
  createError: string | null
  onClose: () => void
}

export function AddRepositoryModal({
  visible,
  onAddProject,
  onCloneProject,
  onCreateNewProject,
  creatingProject,
  cloningProject,
  createError,
  onClose,
}: AddRepositoryModalProps): React.JSX.Element | null {
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
          <h2 id="add-repository-title" style={s.title}>Add Repository</h2>
          <button type="button" style={s.closeButton} onClick={onClose} aria-label="Close add repository dialog">&times;</button>
        </div>
        <div style={s.body}>
          <NoProjectActions
            onAddProject={onAddProject}
            onCloneProject={onCloneProject}
            onCreateNewProject={onCreateNewProject}
            creatingProject={creatingProject}
            cloningProject={cloningProject}
            createError={createError}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
