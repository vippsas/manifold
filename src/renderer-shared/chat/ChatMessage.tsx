import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage as ChatMessageType } from '../../shared/simple-types'
import * as styles from './ChatMessage.styles'

const IMAGE_REF = /\[image:\s*([^\]]+)\]/g
const MARKDOWN_LINK_LINE = /^\[([^\]]+)\]\(([^)\s]+)\)$/
const SUPPORTED_IMAGE_PATH = /\.(?:png|jpe?g|gif|webp)$/i
const URL_LIKE_PATH = /^(?:https?:|data:|blob:)/i

function isSupportedImagePath(filePath: string): boolean {
  return SUPPORTED_IMAGE_PATH.test(filePath.split(/[?#]/, 1)[0] ?? filePath)
}

function imagePathFromPlainLine(line: string): string | null {
  const trimmed = line.trim()
  const candidate = trimmed.startsWith('`') && trimmed.endsWith('`')
    ? trimmed.slice(1, -1).trim()
    : trimmed
  const linkMatch = MARKDOWN_LINK_LINE.exec(candidate)
  if (linkMatch) {
    const linkTarget = linkMatch[2].trim()
    if (!URL_LIKE_PATH.test(linkTarget) && isSupportedImagePath(linkTarget)) return linkTarget
  }
  if (!candidate.includes('/') && !candidate.includes('\\')) return null
  if (URL_LIKE_PATH.test(candidate)) return null
  return isSupportedImagePath(candidate) ? candidate : null
}

/** Pull `[image: PATH]` references out of message text so they can render as thumbnails. */
function splitImageRefs(text: string, includePlainImagePathLines = false): { imagePaths: string[]; rest: string } {
  const imagePaths: string[] = []
  const withoutExplicitRefs = text.replace(IMAGE_REF, (match, p: string) => {
    const filePath = p.trim()
    if (!isSupportedImagePath(filePath)) return match
    imagePaths.push(filePath)
    return ''
  })
  if (!includePlainImagePathLines) return { imagePaths, rest: withoutExplicitRefs.trim() }

  let inCodeFence = false
  const restLines: string[] = []
  for (const line of withoutExplicitRefs.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inCodeFence = !inCodeFence
      restLines.push(line)
      continue
    }
    const filePath = inCodeFence ? null : imagePathFromPlainLine(line)
    if (filePath) {
      imagePaths.push(filePath)
    } else {
      restLines.push(line)
    }
  }
  const rest = restLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return { imagePaths, rest }
}

interface LoadedChatImage {
  filePath: string
  dataUrl: string
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

  const [openImage, setOpenImage] = useState<LoadedChatImage | null>(null)
  const { imagePaths, rest } = splitImageRefs(message.text, !isUser)

  const imageGrid = imagePaths.length > 0 && (
    <div style={rest ? styles.imageGrid : styles.imageGridOnly}>
      {imagePaths.map((filePath, i) => (
        <ChatImageThumbnail key={`${filePath}-${i}`} filePath={filePath} sessionId={message.sessionId} onOpen={setOpenImage} />
      ))}
    </div>
  )

  const content = (
    <>
      <div style={styles.bubble(isUser)} className={isUser ? '' : 'markdown-body'}>
        {isUser ? (
          <>
            {imageGrid}
            {rest && (
              <div ref={canCollapse ? textRef : undefined} style={clamped ? styles.userTextClamped : undefined}>
                {rest}
              </div>
            )}
          </>
        ) : (
          <>
            {imageGrid}
            {rest && <Markdown remarkPlugins={[remarkGfm]}>{rest}</Markdown>}
          </>
        )}
      </div>
      {openImage && <ChatImageLightbox image={openImage} onClose={() => setOpenImage(null)} />}
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
function ChatImageThumbnail({ filePath, sessionId, onOpen }: { filePath: string; sessionId?: string; onOpen: (image: LoadedChatImage) => void }): React.JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const args = sessionId ? [filePath, sessionId] : [filePath]
    window.electronAPI
      .invoke('chat:read-pasted-image', ...args)
      .then((result) => {
        if (cancelled) return
        if (typeof result === 'string' && result.length > 0) {
          setDataUrl(result)
        } else {
          setFailed(true)
        }
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [filePath, sessionId])

  if (failed) return <span style={styles.imageFallback}>{`[image: ${filePath}]`}</span>
  if (!dataUrl) return <div style={styles.imageLoading} aria-label="Loading image" />
  return (
    <button
      type="button"
      style={styles.thumbnailButton}
      onClick={() => onOpen({ filePath, dataUrl })}
      onMouseEnter={(e) => {
        Object.assign(e.currentTarget.style, styles.thumbnailButtonHover)
      }}
      onMouseLeave={(e) => {
        Object.assign(e.currentTarget.style, styles.thumbnailButton)
      }}
      aria-label="Open image attachment"
      title={filePath}
      data-file-path={filePath}
    >
      <img src={dataUrl} alt="Pasted attachment" style={styles.thumbnail} />
    </button>
  )
}

function ChatImageLightbox({ image, onClose }: { image: LoadedChatImage; onClose: () => void }): React.JSX.Element {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const copyPath = (): void => {
    void navigator.clipboard?.writeText(image.filePath)
  }

  // Portal to document.body so the fixed full-screen backdrop resolves against
  // the viewport rather than dockview's transformed `.dv-render-overlay`.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Image preview" style={styles.lightboxBackdrop} onClick={onClose}>
      <div style={styles.lightboxPanel} onClick={(event) => event.stopPropagation()}>
        <div style={styles.lightboxHeader}>
          <span style={styles.lightboxTitle}>Image preview</span>
          <button type="button" style={styles.lightboxCloseButton} onClick={onClose} aria-label="Close image preview">
            &times;
          </button>
        </div>
        <div style={styles.lightboxCanvas}>
          <img src={image.dataUrl} alt="Full resolution attachment" style={styles.lightboxImage} />
        </div>
        <div style={styles.lightboxFooter}>
          <span style={styles.lightboxPath} title={image.filePath}>{image.filePath}</span>
          <button type="button" style={styles.lightboxCopyButton} onClick={copyPath}>Copy path</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
