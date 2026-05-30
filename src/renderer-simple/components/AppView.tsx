import React from 'react'
import type { AppStatus } from '../../shared/simple-types'
import type { ChatMessage as ChatMessageType } from '../../shared/simple-types'
import { StatusBanner } from './StatusBanner'
import { ChatPane } from '../../renderer-shared/chat'
import * as styles from './AppView.styles'

interface Props {
  status: AppStatus
  messages: ChatMessageType[]
  isAgentWorking?: boolean
  agentDurationMs?: number | null
  onSendMessage: (text: string) => void
  onInterrupt?: () => void
  onBack: () => void
  onDeploy: () => void
  liveUrl?: string | null
  deployStatus?: AppStatus | null
  runtimeLabel?: string
}

export function AppView({
  status,
  messages,
  isAgentWorking,
  agentDurationMs,
  onSendMessage,
  onInterrupt,
  onBack,
  onDeploy,
  liveUrl,
  deployStatus,
  runtimeLabel,
}: Props): React.JSX.Element {
  return (
    <div style={styles.container}>
      <StatusBanner
        status={status}
        isAgentWorking={isAgentWorking}
        onBack={onBack}
        onDeploy={onDeploy}
        runtimeLabel={runtimeLabel}
        liveUrl={liveUrl}
        deployStatus={deployStatus}
      />
      <div style={styles.chatSide}>
        <ChatPane
          messages={messages}
          onSend={onSendMessage}
          onInterrupt={onInterrupt}
          isThinking={isAgentWorking}
          durationMs={agentDurationMs}
        />
      </div>
    </div>
  )
}
