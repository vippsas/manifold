import React from 'react'
import type { AgentSession, CreateProjectOptions, SpawnAgentOptions } from '../../../shared/types'
import { NewAgentForm } from './NewAgentForm'
import { onboardingLinkStyle } from './NewAgentForm.styles'
import { NoProjectActions } from '../sidebar/NoProjectActions'

function GhostLinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }): React.JSX.Element {
  const [hover, setHover] = React.useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={onboardingLinkStyle(hover)}
    >
      {children}
    </button>
  )
}

function ManifoldWordmark({ size = 'normal' }: { size?: 'normal' | 'large' }) {
  const fontSize = size === 'large' ? 32 : 22
  const trackingEm = size === 'large' ? '0.15em' : '0.12em'
  const ruleWidth = size === 'large' ? 60 : 40
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize,
        fontWeight: 200,
        letterSpacing: trackingEm,
        color: 'var(--text-primary)',
        opacity: 0.8,
        fontFamily: 'var(--font-sans)',
      }}>
        MANIFOLD
      </div>
      <div style={{
        width: ruleWidth,
        height: 1,
        background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
        margin: '8px auto 0',
        opacity: 0.5,
      }} />
    </div>
  )
}

interface NoProjectProps {
  variant: 'no-project'
  onAddProject: () => void
  onCloneProject: (url: string) => Promise<boolean>
  onCreateNewProject: (options: CreateProjectOptions) => Promise<boolean>
  creatingProject?: boolean
  cloningProject?: boolean
  createError?: string | null
  onBack?: () => void
}

interface NoAgentProps {
  variant: 'no-agent'
  projectId: string
  projectName: string
  projectPath: string
  baseBranch: string
  isGitProject: boolean
  defaultRuntime: string
  defaultAgentMode: 'interactive' | 'chat'
  onLaunch: (options: SpawnAgentOptions) => Promise<unknown>
  existingSessions?: AgentSession[]
  onResumeSession?: (sessionId: string, runtimeId: string) => Promise<void>
  onDeleteSession?: (session: AgentSession) => void
  focusTrigger?: number
  onNewSuperagent?: () => void
}

type OnboardingViewProps = NoProjectProps | NoAgentProps

export function OnboardingView(props: OnboardingViewProps): React.JSX.Element {
  const onBack = props.variant === 'no-project' ? props.onBack : undefined

  React.useEffect(() => {
    if (!onBack) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onBack])

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-xl)',
        minHeight: 0,
        color: 'var(--text-secondary)',
        userSelect: 'none',
      }}
    >
      <ManifoldWordmark size="normal" />

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
            <GhostLinkButton onClick={props.onBack}>Back to workspace</GhostLinkButton>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-lg)' }}>
            <div style={{
              fontSize: 'var(--type-title)',
              fontWeight: 300,
              color: 'var(--text-primary)',
              letterSpacing: 'var(--tracking-tight)',
            }}>
              New agent for <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{props.projectName}</span>
            </div>
            <NewAgentForm
              projectId={props.projectId}
              projectPath={props.projectPath}
              baseBranch={props.baseBranch}
              isGitProject={props.isGitProject}
              defaultRuntime={props.defaultRuntime}
              defaultAgentMode={props.defaultAgentMode}
              onLaunch={props.onLaunch}
              existingSessions={props.existingSessions}
              onResumeSession={props.onResumeSession}
              onDeleteSession={props.onDeleteSession}
              focusTrigger={props.focusTrigger}
            />
          </div>
          {props.onNewSuperagent && (
            <GhostLinkButton onClick={props.onNewSuperagent}>+ New Superagent</GhostLinkButton>
          )}
        </>
      )}
    </div>
  )
}
