import React from 'react'
import type { AppStatus } from '../../shared/simple-types'
import type { ChatMessage as ChatMessageType } from '../../shared/simple-types'
import { StatusBanner } from './StatusBanner'
import { ChatPane } from './ChatPane'
import { PreviewPane } from './PreviewPane'
import * as styles from './AppView.styles'

interface Props {
  status: AppStatus
  messages: ChatMessageType[]
  previewUrl: string | null
  isAgentWorking?: boolean
  agentDurationMs?: number | null
  onSendMessage: (text: string) => void
  onBack: () => void
  onDeploy: () => void
  onDevMode: () => void
}

export function AppView({
  status,
  messages,
  previewUrl,
  isAgentWorking,
  agentDurationMs,
  onSendMessage,
  onBack,
  onDeploy,
  onDevMode,
}: Props): React.JSX.Element {
  return (
    <div style={styles.container}>
      <StatusBanner
        status={status}
        onBack={onBack}
        onDeploy={onDeploy}
        onDevMode={onDevMode}
      />
      <div style={styles.splitPane}>
        <div style={styles.chatSide}>
          <ChatPane
            messages={messages}
            onSend={onSendMessage}
            isThinking={isAgentWorking}
            durationMs={agentDurationMs}
          />
        </div>
        <div style={styles.previewSide}>
          <PreviewPane url={previewUrl} />
        </div>
      </div>
    </div>
  )
}
