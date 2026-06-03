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
  const glyphSize = size === 'large' ? 88 : 64
  const ruleWidth = size === 'large' ? 72 : 48
  return (
    <div style={{ textAlign: 'center' }}>
      <svg
        width={glyphSize}
        height={glyphSize}
        viewBox="0 0 1024 1024"
        role="img"
        aria-label="Manifold"
        style={{ display: 'block', margin: '0 auto' }}
      >
        <defs>
          <mask id="onboarding-ghost-cutouts">
            <rect width="1024" height="1024" fill="white" />
            <circle cx="410" cy="440" r="52" fill="black" />
            <circle cx="614" cy="440" r="52" fill="black" />
            <path d="M 430 540 Q 512 610 594 540 Q 570 580 512 590 Q 454 580 430 540 Z" fill="black" />
          </mask>
        </defs>
        <path
          mask="url(#onboarding-ghost-cutouts)"
          fill="var(--accent)"
          d="M 512 180 C 340 180 260 310 260 440 L 260 700 Q 260 740 290 740 Q 320 710 350 740 Q 380 770 410 740 Q 440 710 470 740 Q 500 770 530 740 Q 560 710 590 740 Q 620 770 650 740 Q 680 710 710 740 Q 740 770 764 740 L 764 440 C 764 310 684 180 512 180 Z"
        />
      </svg>
      <div style={{
        width: ruleWidth,
        height: 2,
        borderRadius: 1,
        background: 'var(--accent)',
        margin: '12px auto 0',
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
  compact?: boolean
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
              compact={props.compact}
            />
          </div>
        </>
      )}
    </div>
  )
}
