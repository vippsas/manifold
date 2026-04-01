import React, { useRef, useState, useCallback } from 'react'
import type { CreateProjectOptions } from '../../../shared/types'
import { slugifyRepoName, suggestRepoName } from '../../../shared/repo-name'
import { createDialogStyles } from '../workbench-style-primitives'
import { useAutoFocus } from '../../hooks/useAutoFocus'

const buttonStyle: React.CSSProperties = {
  padding: '8px 20px',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--accent-text)',
  backgroundColor: 'var(--accent)',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  color: 'var(--text-primary)',
  backgroundColor: 'var(--bg-input)',
}

const repoDialogBaseStyles = createDialogStyles('440px')

const repoDialogStyles: Record<string, React.CSSProperties> = {
  ...repoDialogBaseStyles,
  panel: {
    ...repoDialogBaseStyles.panel,
    display: 'flex',
    flexDirection: 'column',
  },
  description: {
    margin: 0,
    fontSize: 'var(--type-ui-small)',
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
  },
  repoNameInput: {
    ...repoDialogBaseStyles.input,
    padding: '0 var(--space-md)',
    fontFamily: 'var(--font-mono)',
  },
  detailsCard: {
    display: 'grid',
    gap: 'var(--space-sm)',
    padding: 'var(--space-md)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'color-mix(in srgb, var(--bg-elevated) 86%, transparent)',
  },
  detailRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-md)',
  },
  detailLabel: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-secondary)',
  },
  detailValue: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
  },
}

export function NoProjectActions({
  onAddProject,
  onCloneProject,
  onCreateNewProject,
  creatingProject,
  cloningProject,
  createError,
}: {
  onAddProject: () => void
  onCloneProject: (url: string) => Promise<boolean>
  onCreateNewProject: (options: CreateProjectOptions) => Promise<boolean>
  creatingProject?: boolean
  cloningProject?: boolean
  createError?: string | null
}): React.JSX.Element {
  const [description, setDescription] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [repoName, setRepoName] = useState('')
  const [showClone, setShowClone] = useState(false)
  const [showRepoNameDialog, setShowRepoNameDialog] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const openRepoNameDialog = useCallback((): void => {
    const trimmed = description.trim()
    if (trimmed && !creatingProject) {
      setRepoName(suggestRepoName(trimmed))
      setShowRepoNameDialog(true)
    }
  }, [description, creatingProject])

  const handleCreateSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault()
      openRepoNameDialog()
    },
    [openRepoNameDialog]
  )

  const handleConfirmCreate = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault()
      const trimmedDescription = description.trim()
      const normalizedRepoName = slugifyRepoName(repoName)
      if (!trimmedDescription || !normalizedRepoName || creatingProject) {
        return
      }

      const created = await onCreateNewProject({
        description: trimmedDescription,
        repoName: normalizedRepoName,
      })

      if (created) {
        setDescription('')
        setRepoName('')
        setShowRepoNameDialog(false)
      }
    },
    [description, repoName, creatingProject, onCreateNewProject]
  )

  const handleCloneSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault()
      const url = cloneUrl.trim()
      if (url && !cloningProject) {
        const success = await onCloneProject(url)
        if (success) {
          setCloneUrl('')
          setShowClone(false)
        }
      }
    },
    [cloneUrl, cloningProject, onCloneProject]
  )

  const handleCloseRepoDialog = useCallback((): void => {
    if (creatingProject) return
    setShowRepoNameDialog(false)
  }, [creatingProject])

  const canSubmit = description.trim().length > 0 && !creatingProject

  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>
        Start a new project
      </div>
      <form ref={formRef} onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 480, maxWidth: '90%' }}>
        <div style={{ position: 'relative' }}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your project idea..."
            autoFocus
            rows={5}
            style={{
              width: '100%',
              padding: '10px 14px',
              paddingBottom: 44,
              fontSize: 13,
              lineHeight: 1.5,
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey && canSubmit) {
                e.preventDefault()
                formRef.current?.requestSubmit()
              }
            }}
          />
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              ...buttonStyle,
              padding: '6px 16px',
              fontSize: 13,
              opacity: canSubmit ? 1 : 0.5,
              position: 'absolute',
              right: 8,
              bottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Go
          </button>
        </div>
        {createError && !showClone && !showRepoNameDialog && (
          <div style={{ fontSize: 12, color: 'var(--error, #f44)' }}>{createError}</div>
        )}
      </form>

      <div style={{
        width: 480,
        maxWidth: '90%',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        margin: '8px 0',
      }}>
        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or open an existing repository</span>
        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onAddProject} style={secondaryButtonStyle}>+ Add Local Repository</button>
        <button onClick={() => setShowClone((p) => !p)} style={secondaryButtonStyle}>Clone Repository</button>
      </div>
      {showClone && (
        <>
          <form onSubmit={(e) => void handleCloneSubmit(e)} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={cloneUrl}
              onChange={(e) => setCloneUrl(e.target.value)}
              placeholder="git@github.com:user/repo.git"
              autoFocus
              disabled={cloningProject}
              style={{
                padding: '7px 12px',
                fontSize: 13,
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                outline: 'none',
                width: 320,
                opacity: cloningProject ? 0.6 : 1,
              }}
            />
            <button
              type="submit"
              disabled={!cloneUrl.trim() || cloningProject}
              style={{ ...buttonStyle, opacity: !cloneUrl.trim() || cloningProject ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {cloningProject && <span className="spinner" />}
              {cloningProject ? 'Cloning...' : 'Clone'}
            </button>
          </form>
          {createError && showClone && (
            <div style={{ fontSize: 12, color: 'var(--error, #f44)', maxWidth: 480 }}>{createError}</div>
          )}
        </>
      )}
      <RepoNameDialog
        visible={showRepoNameDialog}
        repoName={repoName}
        creatingProject={creatingProject}
        error={showRepoNameDialog ? createError : null}
        onRepoNameChange={(value) => setRepoName(slugifyRepoName(value))}
        onClose={handleCloseRepoDialog}
        onSubmit={handleConfirmCreate}
      />
    </>
  )
}

function RepoNameDialog({
  visible,
  repoName,
  creatingProject,
  error,
  onRepoNameChange,
  onClose,
  onSubmit,
}: {
  visible: boolean
  repoName: string
  creatingProject?: boolean
  error?: string | null
  onRepoNameChange: (value: string) => void
  onClose: () => void
  onSubmit: (e: React.FormEvent) => Promise<void>
}): React.JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useAutoFocus(visible, inputRef)

  const canSubmit = repoName.trim().length > 0 && !creatingProject

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target === overlayRef.current) {
        onClose()
      }
    },
    [onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [onClose]
  )

  if (!visible) return null

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      style={repoDialogStyles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Choose repository name"
    >
      <form onSubmit={(e) => void onSubmit(e)} style={repoDialogStyles.panel}>
        <div style={repoDialogStyles.header}>
          <span style={repoDialogStyles.title}>Choose repository name</span>
          <button type="button" onClick={onClose} style={repoDialogStyles.closeButton} aria-label="Close repository name dialog">
            &times;
          </button>
        </div>
        <div style={repoDialogStyles.body}>
          <p style={repoDialogStyles.description}>
            Confirm the repository folder name before Manifold creates the repo.
          </p>
          <label style={repoDialogStyles.label}>
            Repository name
            <input
              ref={inputRef}
              type="text"
              value={repoName}
              onChange={(e) => onRepoNameChange(e.target.value)}
              placeholder="new-project"
              disabled={creatingProject}
              style={repoDialogStyles.repoNameInput}
            />
            <span style={repoDialogStyles.helpText}>Use lowercase letters, numbers, and hyphens.</span>
          </label>
          <div style={repoDialogStyles.detailsCard}>
            <div style={repoDialogStyles.detailRow}>
              <span style={repoDialogStyles.detailLabel}>Folder name</span>
              <code style={repoDialogStyles.detailValue}>{repoName || 'choose-a-name'}</code>
            </div>
            <div style={repoDialogStyles.detailRow}>
              <span style={repoDialogStyles.detailLabel}>Initial branch</span>
              <code style={repoDialogStyles.detailValue}>main</code>
            </div>
          </div>
          {error && <p style={repoDialogStyles.errorText}>{error}</p>}
        </div>
        <div style={repoDialogStyles.footer}>
          <button type="button" onClick={onClose} style={repoDialogStyles.cancelButton}>Cancel</button>
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              ...repoDialogStyles.saveButton,
              opacity: canSubmit ? 1 : 0.55,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
            }}
          >
            {creatingProject && <span className="spinner" />}
            {creatingProject ? 'Creating...' : 'Create Repository'}
          </button>
        </div>
      </form>
    </div>
  )
}
