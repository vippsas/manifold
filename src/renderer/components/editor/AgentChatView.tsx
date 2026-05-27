import React, { useCallback } from 'react'
import { ChatPane, useChat, useAgentStatus } from '../../../renderer-shared/chat'
import type { PastedImage } from '../../../renderer-shared/chat/ChatPane'

interface AgentChatViewProps {
  sessionId: string
}

export function AgentChatView({ sessionId }: AgentChatViewProps): React.JSX.Element {
  const { messages, sendMessage } = useChat(sessionId)
  const { status, durationMs } = useAgentStatus(sessionId)
  const interrupt = useCallback(() => {
    void window.electronAPI.invoke('agent:interrupt', sessionId)
  }, [sessionId])

  const handleSend = useCallback(
    async (text: string, images?: PastedImage[]): Promise<void> => {
      if (!images || images.length === 0) {
        sendMessage(text)
        return
      }
      try {
        const paths = await Promise.all(
          images.map((img) =>
            window.electronAPI.invoke('chat:save-pasted-image', sessionId, img.dataUrl) as Promise<string>,
          ),
        )
        const references = paths.map((p) => `[image: ${p}]`).join('\n')
        const combined = text ? `${references}\n${text}` : references
        sendMessage(combined)
      } catch (err) {
        console.error('[AgentChatView] failed to save pasted images:', err)
        if (text) sendMessage(text)
      }
    },
    [sessionId, sendMessage],
  )

  return (
    <div style={{ height: '100%' }}>
      <ChatPane
        messages={messages}
        onSend={(text, images) => { void handleSend(text, images) }}
        onInterrupt={interrupt}
        isThinking={status === 'running'}
        durationMs={durationMs}
        acceptImages
      />
    </div>
  )
}
