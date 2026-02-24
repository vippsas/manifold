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
  onCloneProject: (url: string) => Promise<boolean>
  onCreateNewProject: (description: string) => void
  creatingProject?: boolean
  cloningProject?: boolean
  createError?: string | null
  onBack?: () => void
}

interface NoAgentProps {
  variant: 'no-agent'
  onNewAgent: (description: string) => void
  onBack?: () => void
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
        <>
          <NoProjectActions
            onAddProject={props.onAddProject}
            onCloneProject={props.onCloneProject}
            onCreateNewProject={props.onCreateNewProject}
            creatingProject={props.creatingProject}
            cloningProject={props.cloningProject}
            createError={props.createError}
          />
          {props.onBack && (
            <button
              onClick={props.onBack}
              style={{
                marginTop: 8,
                padding: '6px 16px',
                fontSize: 12,
                color: 'var(--text-muted)',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Back to workspace
            </button>
          )}
        </>
      ) : (
        <>
          <NewTaskInput onNewAgent={props.onNewAgent} />
          {props.onBack && (
            <button
              onClick={props.onBack}
              style={{
                marginTop: 8,
                padding: '6px 16px',
                fontSize: 12,
                color: 'var(--text-muted)',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Back to workspace
            </button>
          )}
        </>
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
  cloningProject,
  createError,
}: {
  onAddProject: () => void
  onCloneProject: (url: string) => Promise<boolean>
  onCreateNewProject: (description: string) => void
  creatingProject?: boolean
  cloningProject?: boolean
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
            {creatingProject && <span className="spinner" />}
            {creatingProject ? 'Creating...' : 'Go'}
          </button>
        </div>
        {createError && !showClone && (
          <div style={{ fontSize: 12, color: 'var(--status-error, #f44)' }}>{createError}</div>
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
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or open an existing project</span>
        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onAddProject} style={secondaryButtonStyle}>+ Add Local Project</button>
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
            <div style={{ fontSize: 12, color: 'var(--status-error, #f44)', maxWidth: 480 }}>{createError}</div>
          )}
        </>
      )}
    </>
  )
}
