import React, { useState, useCallback } from 'react'

const LOGO = `    __  ___            _ ____      __    __
   /  |/  /___ _____  (_) __/___  / /___/ /
  / /|_/ / __ \`/ __ \\/ / /_/ __ \\/ / __  /
 / /  / / /_/ / / / / / __/ /_/ / / /_/ /
/_/  /_/\\__,_/_/ /_/_/_/  \\____/_/\\__,_/`

const buttonStyle: React.CSSProperties = {
  padding: '8px 20px',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--bg-primary)',
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
}

interface NoAgentProps {
  variant: 'no-agent'
  onNewAgent: () => void
}

type OnboardingViewProps = NoProjectProps | NoAgentProps

export function OnboardingView(props: OnboardingViewProps): React.JSX.Element {
  return (
    <div
      style={{
        flex: 1,
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
        <NoProjectActions onAddProject={props.onAddProject} onCloneProject={props.onCloneProject} />
      ) : (
        <>
          <div style={{ fontSize: 14 }}>No tasks running. Create one to get started.</div>
          <button onClick={props.onNewAgent} style={buttonStyle}>+ New Task</button>
        </>
      )}
    </div>
  )
}

function NoProjectActions({
  onAddProject,
  onCloneProject,
}: {
  onAddProject: () => void
  onCloneProject: (url: string) => void
}): React.JSX.Element {
  const [cloneUrl, setCloneUrl] = useState('')
  const [showClone, setShowClone] = useState(false)

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

  return (
    <>
      <div style={{ fontSize: 14 }}>Add a project to get started.</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onAddProject} style={buttonStyle}>+ Add Local Project</button>
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
