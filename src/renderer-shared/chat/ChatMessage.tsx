import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage as ChatMessageType } from '../../shared/simple-types'
import * as styles from './ChatMessage.styles'

const IMAGE_REF = /\[image:\s*([^\]]+)\]/g

/** Pull `[image: PATH]` references out of message text so they can render as thumbnails. */
function splitImageRefs(text: string): { imagePaths: string[]; rest: string } {
  const imagePaths: string[] = []
  const rest = text.replace(IMAGE_REF, (_match, p: string) => {
    imagePaths.push(p.trim())
    return ''
  }).trim()
  return { imagePaths, rest }
}

interface Props {
  message: ChatMessageType
  onOptionClick?: (option: string) => void
  hideOptions?: boolean
  /** A preceding reply exists — extend the timeline up to this node. */
  connectAbove?: boolean
  /** A following reply exists — extend the timeline down to the next node. */
  connectBelow?: boolean
  /** Clamp tall user messages to a few lines with a Show more / Show less toggle. */
  collapsible?: boolean
}

export function ChatMessage({ message, onOptionClick, hideOptions, connectAbove, connectBelow, collapsible }: Props): React.JSX.Element {
  const isUser = message.role === 'user'
  const showOptions = !hideOptions && message.options && message.options.length > 0

  const canCollapse = isUser && collapsible === true
  const textRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    if (!canCollapse) return
    const el = textRef.current
    if (!el) return
    setOverflowing(el.scrollHeight > styles.COLLAPSED_MAX_HEIGHT + 1)
  }, [canCollapse, message.text])

  const clamped = canCollapse && overflowing && !expanded

  const { imagePaths, rest } = isUser ? splitImageRefs(message.text) : { imagePaths: [], rest: message.text }

  const content = (
    <>
      <div style={styles.bubble(isUser)} className={isUser ? '' : 'markdown-body'}>
        {isUser ? (
          <>
            {imagePaths.length > 0 && (
              <div style={rest ? styles.imageGrid : styles.imageGridOnly}>
                {imagePaths.map((filePath, i) => (
                  <ChatImageThumbnail key={`${filePath}-${i}`} filePath={filePath} />
                ))}
              </div>
            )}
            {rest && (
              <div ref={canCollapse ? textRef : undefined} style={clamped ? styles.userTextClamped : undefined}>
                {rest}
              </div>
            )}
          </>
        ) : (
          <Markdown remarkPlugins={[remarkGfm]}>{message.text}</Markdown>
        )}
      </div>
      {canCollapse && overflowing && (
        <button style={styles.collapseToggle} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
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
    </>
  )

  if (isUser) {
    return <div style={styles.wrapper(true)}>{content}</div>
  }

  return (
    <div style={styles.threadRow}>
      <div style={styles.threadGutter}>
        {connectAbove && <div style={styles.threadLineTop} />}
        {connectBelow && <div style={styles.threadLineBottom} />}
        <div style={styles.threadDot} />
      </div>
      <div style={styles.threadContent}>{content}</div>
    </div>
  )
}

/** Loads a pasted image from disk and renders it as a thumbnail inside the message bubble. */
function ChatImageThumbnail({ filePath }: { filePath: string }): React.JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.electronAPI
      .invoke('chat:read-pasted-image', filePath)
      .then((result) => { if (!cancelled) setDataUrl(result as string) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [filePath])

  if (failed) return <span style={styles.imageFallback}>{`[image: ${filePath}]`}</span>
  if (!dataUrl) return <div style={styles.imageLoading} aria-label="Loading image" />
  return <img src={dataUrl} alt="Pasted attachment" style={styles.thumbnail} />
}
