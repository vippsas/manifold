import React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage as ChatMessageType } from '../../shared/simple-types'
import * as styles from './ChatMessage.styles'

interface Props {
  message: ChatMessageType
  onOptionClick?: (option: string) => void
  hideOptions?: boolean
}

export function ChatMessage({ message, onOptionClick, hideOptions }: Props): React.JSX.Element {
  const isUser = message.role === 'user'
  const showOptions = !hideOptions && message.options && message.options.length > 0
  return (
    <div style={styles.wrapper(isUser)}>
      <div style={styles.bubble(isUser)} className={isUser ? '' : 'markdown-body'}>
        {isUser ? (
          message.text
        ) : (
          <Markdown remarkPlugins={[remarkGfm]}>{message.text}</Markdown>
        )}
      </div>
      {showOptions && (
        <div style={styles.optionsSection}>
          <span style={styles.optionsHeader}>Answer question</span>
          <div style={styles.optionsStem} />
          <div style={styles.optionsContainer}>
            {message.options!.map((option, i) => {
              const isLast = i === message.options!.length - 1
              return (
                <div key={option} style={styles.optionRow}>
                  <div style={styles.connectorCol}>
                    <div style={styles.connectorTop} />
                    {!isLast && <div style={styles.connectorBottom} />}
                    <div style={styles.connectorArm} />
                  </div>
                  <div style={styles.optionChipWrap}>
                    <button
                      style={styles.optionChip}
                      onClick={() => onOptionClick?.(option)}
                      onMouseEnter={(e) => {
                        Object.assign(e.currentTarget.style, styles.optionChipHover)
                      }}
                      onMouseLeave={(e) => {
                        Object.assign(e.currentTarget.style, styles.optionChip)
                      }}
                    >
                      {option}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <span style={styles.optionsHint}>or type your own answer below</span>
        </div>
      )}
    </div>
  )
}
