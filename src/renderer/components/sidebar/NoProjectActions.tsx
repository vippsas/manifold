import React, { useRef, useState, useCallback } from 'react'
import type { CreateProjectOptions } from '../../../shared/types'

type PromptMode = 'scratch' | 'copied'

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

const promptPlaceholderByMode: Record<PromptMode, string> = {
  scratch: 'Describe what you want to build...',
  copied: 'Paste the copied project instructions...',
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
  const [promptMode, setPromptMode] = useState<PromptMode | null>(null)
  const [description, setDescription] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [showClone, setShowClone] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const handleCreateSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault()
      const trimmed = description.trim()
      if (!trimmed || creatingProject) return
      const created = await onCreateNewProject({
        description: trimmed,
        ...(promptMode === 'copied' ? { projectKind: 'folder' as const } : {}),
      })
      if (created) {
        setDescription('')
        setPromptMode(null)
      }
    },
    [description, promptMode, creatingProject, onCreateNewProject]
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

  const canSubmit = description.trim().length > 0 && !creatingProject
  const promptPlaceholder = promptMode ? promptPlaceholderByMode[promptMode] : undefined

  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>
        Start a new project
      </div>
      {promptMode ? (
        <form ref={formRef} onSubmit={(e) => void handleCreateSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 480, maxWidth: '90%' }}>
          <div style={{ position: 'relative' }}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={promptPlaceholder}
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
              aria-busy={creatingProject || undefined}
            >
              {creatingProject && <span className="spinner" aria-hidden="true" />}
              {creatingProject ? 'Creating…' : 'Go'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setDescription('')
              setPromptMode(null)
            }}
            style={{
              ...secondaryButtonStyle,
              alignSelf: 'flex-start',
              padding: '6px 14px',
              fontSize: 12,
            }}
          >
            Back
          </button>
          {createError && !showClone && (
            <div style={{ fontSize: 12, color: 'var(--error, #f44)' }}>{createError}</div>
          )}
        </form>
      ) : (
        <div style={{
          width: 480,
          maxWidth: '90%',
          display: 'flex',
          justifyContent: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          <button onClick={() => setPromptMode('scratch')} style={buttonStyle}>Start from scratch</button>
          <button onClick={() => setPromptMode('copied')} style={secondaryButtonStyle}>Start from copied instructions</button>
          {createError && !showClone && (
            <div style={{ flexBasis: '100%', fontSize: 12, color: 'var(--error, #f44)', textAlign: 'center' }}>{createError}</div>
          )}
        </div>
      )}

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
    </>
  )
}
