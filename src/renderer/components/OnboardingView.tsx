import React, { useRef, useState, useCallback } from 'react'

const LOGO = `  .--.      __  ___            _ ____      __    __
 / oo \\    /  |/  /___ _____  (_) __/___  / /___/ /
| \\__/ |  / /|_/ / __ \`/ __ \\/ / /_/ __ \\/ / __  /
 \\    /  / /  / / /_/ / / / / / __/ /_/ / / /_/ /
  \\__/  /_/  /_/\\__,_/_/ /_/_/_/  \\____/_/\\__,_/`

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

interface NoProjectProps {
  variant: 'no-project'
  onAddProject: () => void
  onCloneProject: (url: string) => void
  onCreateNewProject: (description: string) => void
  creatingProject?: boolean
  createError?: string | null
}

interface NoAgentProps {
  variant: 'no-agent'
  onNewAgent: (description: string) => void
}

type OnboardingViewProps = NoProjectProps | NoAgentProps

export function OnboardingView(props: OnboardingViewProps): React.JSX.Element {
  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        minHeight: 0,
        color: 'var(--text-secondary)',
        userSelect: 'none',
      }}
    >
      <pre style={{ margin: 0, fontSize: 14, lineHeight: 1.3, color: 'var(--text-primary)', opacity: 0.6 }}>
        {LOGO}
      </pre>

      {props.variant === 'no-project' ? (
        <NoProjectActions
          onAddProject={props.onAddProject}
          onCloneProject={props.onCloneProject}
          onCreateNewProject={props.onCreateNewProject}
          creatingProject={props.creatingProject}
          createError={props.createError}
        />
      ) : (
        <NewTaskInput onNewAgent={props.onNewAgent} />
      )}
    </div>
  )
}

function NewTaskInput({ onNewAgent }: { onNewAgent: (description: string) => void }): React.JSX.Element {
  const [value, setValue] = useState('')

  const handleSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault()
      const trimmed = value.trim()
      if (trimmed) onNewAgent(trimmed)
    },
    [value, onNewAgent]
  )

  return (
    <>
      <div style={{ fontSize: 14 }}>Name your next task</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, width: 400, maxWidth: '90%' }}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Dark mode toggle"
          autoFocus
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: 13,
            backgroundColor: 'var(--bg-input)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            outline: 'none',
          }}
        />
        <button type="submit" disabled={!value.trim()} style={{ ...buttonStyle, opacity: value.trim() ? 1 : 0.5 }}>
          Start
        </button>
      </form>
    </>
  )
}

function NoProjectActions({
  onAddProject,
  onCloneProject,
  onCreateNewProject,
  creatingProject,
  createError,
}: {
  onAddProject: () => void
  onCloneProject: (url: string) => void
  onCreateNewProject: (description: string) => void
  creatingProject?: boolean
  createError?: string | null
}): React.JSX.Element {
  const [description, setDescription] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [showClone, setShowClone] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const handleCreateSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault()
      const trimmed = description.trim()
      if (trimmed && !creatingProject) {
        onCreateNewProject(trimmed)
      }
    },
    [description, creatingProject, onCreateNewProject]
  )

  const handleCloneSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault()
      const url = cloneUrl.trim()
      if (url) {
        onCloneProject(url)
        setCloneUrl('')
        setShowClone(false)
      }
    },
    [cloneUrl, onCloneProject]
  )

  const canSubmit = description.trim().length > 0 && !creatingProject

  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>
        Start a new project
      </div>
      <form ref={formRef} onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 480, maxWidth: '90%' }}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your project idea..."
          autoFocus
          rows={5}
          style={{
            padding: '10px 14px',
            fontSize: 13,
            lineHeight: 1.5,
            backgroundColor: 'var(--bg-input)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.metaKey && canSubmit) {
              e.preventDefault()
              formRef.current?.requestSubmit()
            }
          }}
        />
        {createError && (
          <div style={{ fontSize: 12, color: 'var(--status-error, #f44)' }}>{createError}</div>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            ...buttonStyle,
            padding: '10px 24px',
            fontSize: 14,
            opacity: canSubmit ? 1 : 0.5,
            alignSelf: 'flex-end',
          }}
        >
          {creatingProject ? 'Creating...' : 'Go'}
        </button>
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
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or open an existing project</span>
        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onAddProject} style={secondaryButtonStyle}>+ Add Local Project</button>
        <button onClick={() => setShowClone((p) => !p)} style={secondaryButtonStyle}>Clone Repository</button>
      </div>
      {showClone && (
        <form onSubmit={handleCloneSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={cloneUrl}
            onChange={(e) => setCloneUrl(e.target.value)}
            placeholder="https://github.com/user/repo.git"
            autoFocus
            style={{
              padding: '7px 12px',
              fontSize: 13,
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              outline: 'none',
              width: 320,
            }}
          />
          <button type="submit" style={buttonStyle}>Clone</button>
        </form>
      )}
    </>
  )
}
