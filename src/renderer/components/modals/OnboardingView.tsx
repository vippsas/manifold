import React from 'react'
import type { SpawnAgentOptions } from '../../../shared/types'
import { NewAgentForm } from './NewAgentForm'
import { NoProjectActions } from '../sidebar/NoProjectActions'

const LOGO = `  .--.      __  ___            _ ____      __    __
 / oo \\    /  |/  /___ _____  (_) __/___  / /___/ /
| \\__/ |  / /|_/ / __ \`/ __ \\/ / /_/ __ \\/ / __  /
 \\    /  / /  / / /_/ / / / / / __/ /_/ / / /_/ /
  \\__/  /_/  /_/\\__,_/_/ /_/_/_/  \\____/_/\\__,_/`

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
  onLaunch: (options: SpawnAgentOptions) => void
  focusTrigger?: number
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
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
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
