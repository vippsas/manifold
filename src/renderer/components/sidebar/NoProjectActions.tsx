import React, { useRef, useState, useCallback } from 'react'
import type { CreateProjectOptions } from '../../../shared/types'
import { modeToggleStyles, startButtonStyle, onboardingLinkStyle } from '../modals/NewAgentForm.styles'
import {
  headingStyle,
  headingEmphasisStyle,
  chooserRowStyle,
  cardStyle,
  cardHoverStyle,
  cardIconStyle,
  cardTitleStyle,
  cardSubtitleStyle,
  focusedColumnStyle,
} from './NoProjectActions.styles'

type PromptMode = 'scratch' | 'copied'
type View = 'chooser' | 'new' | 'clone'

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

// No box: the `.reticle-input` resting brackets (theme.css) are the field's edge,
// dimmed while idle and brightening to full accent on focus. Border stays
// 1px-transparent so the focus reticle has a border-box to paint into without
// shifting layout; --radius-md keeps corners square enough for the brackets.
const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: 'var(--type-ui)',
  lineHeight: 1.5,
  backgroundColor: 'transparent',
  color: 'var(--text-primary)',
  border: '1px solid transparent',
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

const glyphProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
  'aria-hidden': true,
}

// Lucide "sparkles" — a fresh start.
function NewProjectGlyph(): React.JSX.Element {
  return (
    <svg {...glyphProps}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </svg>
  )
}

// Lucide "folder" — a folder already on disk.
function LocalRepoGlyph(): React.JSX.Element {
  return (
    <svg {...glyphProps}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  )
}

// Lucide "git-branch" — cloning a remote repo.
function CloneGlyph(): React.JSX.Element {
  return (
    <svg {...glyphProps}>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}

function PathCard({
  glyph,
  title,
  subtitle,
  onClick,
}: {
  glyph: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
}): React.JSX.Element {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...cardStyle, ...(hover ? cardHoverStyle : {}) }}
    >
      <span style={cardIconStyle}>{glyph}</span>
      <span style={cardTitleStyle}>{title}</span>
      <span style={cardSubtitleStyle}>{subtitle}</span>
    </button>
  )
}

function BackLink({ onClick }: { onClick: () => void }): React.JSX.Element {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...onboardingLinkStyle(hover), marginTop: 0, alignSelf: 'flex-start' }}
    >
      ← Back
    </button>
  )
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
  const [view, setView] = useState<View>('chooser')
  const [promptMode, setPromptMode] = useState<PromptMode>('copied')
  const [hoveredMode, setHoveredMode] = useState<PromptMode | null>(null)
  const [description, setDescription] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  const goToChooser = useCallback((): void => {
    setView('chooser')
    setDescription('')
    setCloneUrl('')
  }, [])

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
        }
      }
    },
    [cloneUrl, cloningProject, onCloneProject]
  )

  const canSubmit = description.trim().length > 0 && !creatingProject

  if (view === 'chooser') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-xl)' }}>
        <div style={headingStyle}>
          Start a <span style={headingEmphasisStyle}>project</span>
        </div>
        <div style={chooserRowStyle}>
          <PathCard
            glyph={<NewProjectGlyph />}
            title="New project"
            subtitle="Start from scratch, or paste copied instructions"
            onClick={() => setView('new')}
          />
          <PathCard
            glyph={<LocalRepoGlyph />}
            title="Local repository"
            subtitle="Open a folder that's already on your machine"
            onClick={onAddProject}
          />
          <PathCard
            glyph={<CloneGlyph />}
            title="Clone from Git"
            subtitle="Copy a GitHub repo down to your machine"
            onClick={() => setView('clone')}
          />
        </div>
      </div>
    )
  }

  if (view === 'new') {
    return (
      <div style={{ ...focusedColumnStyle, alignItems: 'center' }}>
        <BackLink onClick={goToChooser} />
        <div style={headingStyle}>
          Start a <span style={headingEmphasisStyle}>new project</span>
        </div>
        <form
          ref={formRef}
          onSubmit={(e) => void handleCreateSubmit(e)}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', width: '100%' }}
        >
          <textarea
            className="reticle-input"
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
          {createError && (
            <div style={{ fontSize: 12, color: 'var(--error, #f44)', textAlign: 'center' }}>{createError}</div>
          )}
        </form>
      </div>
    )
  }

  // view === 'clone'
  return (
    <div style={{ ...focusedColumnStyle, alignItems: 'center' }}>
      <BackLink onClick={goToChooser} />
      <div style={headingStyle}>
        Clone a <span style={headingEmphasisStyle}>repository</span>
      </div>
      <form onSubmit={(e) => void handleCloneSubmit(e)} style={{ display: 'flex', gap: 8, width: '100%' }}>
        <input
          type="text"
          value={cloneUrl}
          onChange={(e) => setCloneUrl(e.target.value)}
          placeholder="git@github.com:user/repo.git"
          autoFocus
          disabled={cloningProject}
          style={{
            flex: 1,
            padding: '7px 12px',
            fontSize: 13,
            backgroundColor: 'var(--bg-input)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            outline: 'none',
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
      {createError && (
        <div style={{ fontSize: 12, color: 'var(--error, #f44)', maxWidth: 480 }}>{createError}</div>
      )}
    </div>
  )
}
