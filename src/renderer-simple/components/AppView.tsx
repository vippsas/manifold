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
  runtimeLabel,
}: Props): React.JSX.Element {
  return (
    <div style={styles.container}>
      <StatusBanner
        status={status}
        isAgentWorking={isAgentWorking}
        onBack={onBack}
        runtimeLabel={runtimeLabel}
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
