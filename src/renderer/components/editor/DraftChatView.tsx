import React from 'react'
import { ChatPane } from '../../../renderer-shared/chat'

interface DraftChatViewProps {
  onFirstSend: (text: string) => void
}

export function DraftChatView({ onFirstSend }: DraftChatViewProps): React.JSX.Element {
  return (
    <div style={{ height: '100%' }}>
      <ChatPane
        messages={[]}
        onSend={onFirstSend}
        isThinking={false}
        durationMs={null}
      />
    </div>
  )
}
