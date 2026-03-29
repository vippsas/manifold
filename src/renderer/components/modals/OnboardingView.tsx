import React from 'react'
import type { SpawnAgentOptions } from '../../../shared/types'
import { NewAgentForm } from './NewAgentForm'
import { NoProjectActions } from '../sidebar/NoProjectActions'

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
  onCreateNewProject: (description: string) => void
  creatingProject?: boolean
  cloningProject?: boolean
  createError?: string | null
  onBack?: () => void
}

interface NoAgentProps {
  variant: 'no-agent'
  projectId: string
  projectName: string
  baseBranch: string
  defaultRuntime: string
  onLaunch: (options: SpawnAgentOptions) => Promise<unknown>
  focusTrigger?: number
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
        gap: 24,
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
          <div style={{
            fontSize: 'var(--type-title)',
            fontWeight: 300,
            color: 'var(--text-primary)',
            letterSpacing: 'var(--tracking-tight)',
            marginBottom: 'var(--space-xl)',
          }}>
            New agent for <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{props.projectName}</span>
          </div>
          <NewAgentForm
            projectId={props.projectId}
            baseBranch={props.baseBranch}
            defaultRuntime={props.defaultRuntime}
            onLaunch={props.onLaunch}
            focusTrigger={props.focusTrigger}
          />
        </>
      )}
    </div>
  )
}
