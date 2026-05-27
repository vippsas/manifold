import React from 'react'
import { ChatPane } from '../../../renderer-shared/chat'

interface DraftChatViewProps {
  onFirstSend: (text: string) => void
  projectName?: string
  branchName?: string
}

export function DraftChatView({ onFirstSend, projectName, branchName }: DraftChatViewProps): React.JSX.Element {
  return (
    <div style={{ height: '100%' }}>
      <ChatPane
        messages={[]}
        onSend={onFirstSend}
        isThinking={false}
        durationMs={null}
        placeholder={<DraftPlaceholder projectName={projectName} branchName={branchName} />}
      />
    </div>
  )
}

function DraftPlaceholder({ projectName, branchName }: { projectName?: string; branchName?: string }): React.JSX.Element {
  return (
    <div style={placeholderStyles.container}>
      <div style={placeholderStyles.primary}>
        {projectName ? <>Chatting with Claude in <strong style={placeholderStyles.emphasis}>{projectName}</strong></> : 'Chatting with Claude'}
      </div>
      {branchName && (
        <div style={placeholderStyles.secondary}>on branch {branchName}</div>
      )}
      <div style={placeholderStyles.hint}>Ask anything below.</div>
    </div>
  )
}

const placeholderStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 6,
    textAlign: 'center' as const,
    color: 'var(--text-muted)',
    userSelect: 'none' as const,
  },
  primary: {
    fontSize: 14,
    fontWeight: 400,
    color: 'var(--text-secondary)',
  },
  emphasis: {
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  secondary: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    opacity: 0.7,
  },
}
