import React, { useCallback, useRef, useState } from 'react'
import type { AppStatus } from '../../shared/simple-types'
import type { ChatMessage as ChatMessageType } from '../../shared/simple-types'
import { StatusBanner } from './StatusBanner'
import { ChatPane } from './ChatPane'
import { PreviewPane } from './PreviewPane'
import * as styles from './AppView.styles'

const MIN_CHAT_WIDTH = 280
const MAX_CHAT_FRACTION = 0.7
const DEFAULT_CHAT_FRACTION = 0.4

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
  const splitRef = useRef<HTMLDivElement>(null)
  const [chatWidth, setChatWidth] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMouseMove = (ev: MouseEvent): void => {
        if (!splitRef.current) return
        const rect = splitRef.current.getBoundingClientRect()
        const maxWidth = rect.width * MAX_CHAT_FRACTION
        const newWidth = Math.max(MIN_CHAT_WIDTH, Math.min(ev.clientX - rect.left, maxWidth))
        setChatWidth(newWidth)
      }

      const onMouseUp = (): void => {
        setIsDragging(false)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [],
  )

  const chatSideStyle = {
    ...styles.chatSide,
    width: chatWidth ?? `${DEFAULT_CHAT_FRACTION * 100}%`,
  }

  return (
    <div style={styles.container}>
      <StatusBanner
        status={status}
        isAgentWorking={isAgentWorking}
        onBack={onBack}
        onDeploy={onDeploy}
        onDevMode={onDevMode}
      />
      <div ref={splitRef} style={styles.splitPane}>
        <div style={chatSideStyle}>
          <ChatPane
            messages={messages}
            onSend={onSendMessage}
            isThinking={isAgentWorking}
            durationMs={agentDurationMs}
          />
        </div>
        <div
          style={isDragging ? styles.resizeHandleActive : styles.resizeHandle}
          onMouseDown={handleMouseDown}
        />
        <div style={{ ...styles.previewSide, position: 'relative' }}>
          {isDragging && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 10 }} />
          )}
          <PreviewPane
            url={previewUrl}
            isAgentWorking={isAgentWorking}
            starting={!previewUrl && (status === 'building' || status === 'idle')}
          />
        </div>
      </div>
    </div>
  )
}
