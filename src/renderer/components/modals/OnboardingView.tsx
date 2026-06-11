import React from 'react'
import type { AgentSession, CreateProjectOptions, SpawnAgentOptions } from '../../../shared/types'
import { NewAgentForm } from './NewAgentForm'
import { onboardingLinkStyle } from './NewAgentForm.styles'
import { NoProjectActions } from '../sidebar/NoProjectActions'
import { WorkspaceGlyph } from '../sidebar/WorkspaceGlyph'
import { ManifoldGhost } from '../ManifoldGhost'
import { StarfieldBackdrop } from '../StarfieldBackdrop'

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
    <div style={{ textAlign: 'center', color: 'var(--accent)' }} role="img" aria-label="Manifold">
      <ManifoldGhost size={glyphSize} />
      <div style={{
        width: ruleWidth,
        height: 2,
        borderRadius: 1,
        // Polished bar: yellow gold at the ends, white gold at the center.
        background: 'linear-gradient(90deg, var(--accent), var(--accent-hi, var(--accent-hover)), var(--accent))',
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
  /** When set, this agent belongs to the named workspace (multi-root). Shows a "WORKSPACE · {name}" eyebrow. */
  workspaceName?: string
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
        position: 'relative',
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
        // Depth, not emptiness: a faint accent aura behind the form and a
        // vignette toward the edges so the canvas reads as a lit stage.
        background: [
          'radial-gradient(ellipse 70% 55% at 50% 42%, color-mix(in srgb, var(--accent) 4%, transparent), transparent 70%)',
          'radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.25) 100%)',
        ].join(', '),
      }}
    >
      <StarfieldBackdrop />
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-xs)' }}>
              {props.workspaceName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <WorkspaceGlyph active />
                  <span className="sidebar-workspace-eyebrow">Workspace · {props.workspaceName}</span>
                </div>
              )}
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--type-display)',
                fontWeight: 400,
                color: 'var(--text-primary)',
                letterSpacing: 'var(--tracking-tight)',
              }}>
                New agent for <span style={{ fontStyle: 'italic', fontWeight: 500, color: 'var(--accent-hi, var(--text-primary))' }}>{props.projectName}</span>
              </div>
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
