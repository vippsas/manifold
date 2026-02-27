import React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage as ChatMessageType } from '../../shared/simple-types'
import * as styles from './ChatMessage.styles'

interface Props {
  message: ChatMessageType
}

export function ChatMessage({ message }: Props): React.JSX.Element {
  const isUser = message.role === 'user'
  return (
    <div style={styles.wrapper(isUser)}>
      <div style={styles.bubble(isUser)} className={isUser ? '' : 'markdown-body'}>
        {isUser ? (
          message.text
        ) : (
          <Markdown remarkPlugins={[remarkGfm]}>{message.text}</Markdown>
        )}
      </div>
    </div>
  )
}
