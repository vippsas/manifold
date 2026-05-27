import React, { useCallback } from 'react'
import { ChatPane, useChat, useAgentStatus } from '../../../renderer-shared/chat'

interface AgentChatViewProps {
  sessionId: string
}

export function AgentChatView({ sessionId }: AgentChatViewProps): React.JSX.Element {
  const { messages, sendMessage } = useChat(sessionId)
  const { status, durationMs } = useAgentStatus(sessionId)
  const interrupt = useCallback(() => {
    void window.electronAPI.invoke('agent:interrupt', sessionId)
  }, [sessionId])

  return (
    <div style={{ height: '100%' }}>
      <ChatPane
        messages={messages}
        onSend={sendMessage}
        onInterrupt={interrupt}
        isThinking={status === 'running'}
        durationMs={durationMs}
      />
    </div>
  )
}
