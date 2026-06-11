import React, { useRef, useState, useCallback } from 'react'
import type { CreateProjectOptions } from '../../../shared/types'
import { modeToggleStyles, startButtonStyle } from '../modals/NewAgentForm.styles'

type PromptMode = 'scratch' | 'copied'

const PROMPT_MODES: Array<{ id: PromptMode; label: string }> = [
  { id: 'copied', label: 'Copied instructions' },
  { id: 'scratch', label: 'From scratch' },
]

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
  backgroundColor: 'var(--control-bg)',
  border: '1px solid var(--control-border)',
}

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--type-display)',
  fontWeight: 400,
  color: 'var(--text-primary)',
  letterSpacing: 'var(--tracking-tight)',
}

const headingEmphasisStyle: React.CSSProperties = {
  fontStyle: 'italic',
  fontWeight: 500,
  color: 'var(--accent-hi, var(--text-primary))',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: 'var(--type-ui)',
  lineHeight: 1.5,
  backgroundColor: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
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
  const [promptMode, setPromptMode] = useState<PromptMode>('copied')
  const [hoveredMode, setHoveredMode] = useState<PromptMode | null>(null)
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

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-lg)' }}>
        <div style={headingStyle}>
          Start a <span style={headingEmphasisStyle}>new project</span>
        </div>
        <form
          ref={formRef}
          onSubmit={(e) => void handleCreateSubmit(e)}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', width: 480, maxWidth: '90%' }}
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={promptPlaceholderByMode[promptMode]}
            autoFocus
            rows={5}
            style={textareaStyle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey && canSubmit) {
                e.preventDefault()
                formRef.current?.requestSubmit()
              }
            }}
          />
          <div style={modeToggleStyles.wrapper}>
            <div style={modeToggleStyles.track} role="tablist" aria-label="Project start mode">
              {PROMPT_MODES.map((m) => {
                const active = promptMode === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setPromptMode(m.id)}
                    onMouseEnter={() => setHoveredMode(m.id)}
                    onMouseLeave={() => setHoveredMode(null)}
                    style={{
                      ...modeToggleStyles.segment,
                      ...(active ? modeToggleStyles.segmentActive : {}),
                      ...(!active && hoveredMode === m.id ? modeToggleStyles.segmentHover : {}),
                    }}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-metal"
              style={{ ...startButtonStyle(canSubmit, Boolean(creatingProject)), gap: 6 }}
              aria-busy={creatingProject || undefined}
            >
              {creatingProject && <span className="spinner" aria-hidden="true" />}
              {creatingProject ? 'Creating…' : 'Start Project'}
            </button>
          </div>
          {createError && !showClone && (
            <div style={{ fontSize: 12, color: 'var(--error, #f44)', textAlign: 'center' }}>{createError}</div>
          )}
        </form>
      </div>

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
