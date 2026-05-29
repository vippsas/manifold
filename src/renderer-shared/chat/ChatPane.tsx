import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import type { ChatMessage as ChatMessageType } from '../../shared/simple-types'
import { ChatMessage } from './ChatMessage'
import * as styles from './ChatPane.styles'
import { ThinkingIndicator } from './ChatThinkingIndicator'
import { DurationBadge } from './ChatDurationBadge'
import { MAX_PASTED_IMAGES, useChatImagePaste, type PastedImage } from './useChatImagePaste'
import { useChatFileMentions, type FileDropConfig } from './useChatFileMentions'
import { ChatMentionDropdown } from './ChatMentionDropdown'

export { MAX_PASTED_IMAGES, type PastedImage } from './useChatImagePaste'
export { type FileDropConfig } from './useChatFileMentions'

const INPUT_LINE_HEIGHT = 22
const INPUT_CHROME_HEIGHT = 26
const MAX_VISIBLE_LINES = 4
const MIN_INPUT_HEIGHT = INPUT_LINE_HEIGHT + INPUT_CHROME_HEIGHT
const MAX_INPUT_HEIGHT = INPUT_LINE_HEIGHT * MAX_VISIBLE_LINES + INPUT_CHROME_HEIGHT

interface Props {
  messages: ChatMessageType[]
  onSend: (text: string, images?: PastedImage[]) => void
  onInterrupt?: () => void
  isThinking?: boolean
  durationMs?: number | null
  placeholder?: React.ReactNode
  acceptImages?: boolean
  /** Relative paths offered by the `@FILENAME` autocomplete. Undefined disables it. */
  mentionPaths?: string[]
  /** Slash command/skill names offered by the `/` autocomplete. Undefined disables it. */
  slashCommands?: string[]
  /** Enables drag-and-drop of file-tree paths into the composer. Undefined disables it. */
  fileDrop?: FileDropConfig
}

export function ChatPane({ messages, onSend, onInterrupt, isThinking, durationMs, placeholder, acceptImages = false, mentionPaths, slashCommands, fileDrop }: Props): React.JSX.Element {
  const [input, setInput] = useState('')
  const [dismissedOptions, setDismissedOptions] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pendingSelectionRef = useRef<number | null>(null)

  const { images, isDraggingOver, pasteNotice, removeImage, clearImages, dragHandlers } = useChatImagePaste(acceptImages, inputRef)

  const requestCursor = useCallback((pos: number): void => {
    pendingSelectionRef.current = pos
  }, [])

  const mentions = useChatFileMentions({ paths: mentionPaths, commands: slashCommands, fileDrop, input, setInput, inputRef, requestCursor })

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages, isThinking, durationMs])

  const syncInputHeight = useCallback((): void => {
    const textarea = inputRef.current
    if (!textarea) return

    textarea.style.height = `${MIN_INPUT_HEIGHT}px`
    const nextHeight = Math.min(textarea.scrollHeight, MAX_INPUT_HEIGHT)
    textarea.style.height = `${Math.max(MIN_INPUT_HEIGHT, nextHeight)}px`
    textarea.style.overflowY = textarea.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden'
  }, [])

  useLayoutEffect(() => {
    syncInputHeight()

    if (pendingSelectionRef.current == null) return

    const textarea = inputRef.current
    if (!textarea) return

    textarea.setSelectionRange(pendingSelectionRef.current, pendingSelectionRef.current)
    pendingSelectionRef.current = null
  }, [input, syncInputHeight])

  const dismissAllOptions = (): void => {
    const ids = messages.filter(m => m.options && m.options.length > 0).map(m => m.id)
    if (ids.length > 0) {
      setDismissedOptions(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.add(id))
        return next
      })
    }
  }

  const handleSend = (): void => {
    const message = input.trim()
    if (!message && images.length === 0) return
    dismissAllOptions()
    if (images.length > 0) {
      onSend(message, images)
    } else {
      onSend(message)
    }
    setInput('')
    clearImages()
  }

  const insertLineBreak = (): void => {
    const textarea = inputRef.current
    if (!textarea) {
      setInput((current) => `${current}\n`)
      return
    }

    const selectionStart = textarea.selectionStart ?? input.length
    const selectionEnd = textarea.selectionEnd ?? input.length
    pendingSelectionRef.current = selectionStart + 1
    setInput((current) => `${current.slice(0, selectionStart)}\n${current.slice(selectionEnd)}`)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (mentions.handleKeyDown(e)) return
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return

    e.preventDefault()
    if (e.shiftKey) {
      insertLineBreak()
      return
    }

    handleSend()
  }

  const handleOptionClick = (messageId: string, option: string): void => {
    setDismissedOptions(prev => new Set(prev).add(messageId))
    onSend(option)
  }

  const showPlaceholder = messages.length === 0 && !isThinking && placeholder != null

  const combinedDragHandlers = {
    onDragEnter: (e: React.DragEvent<HTMLDivElement>): void => {
      if (mentions.isPathDrag(e.dataTransfer)) mentions.pathDragHandlers?.onDragEnter(e)
      else dragHandlers.onDragEnter(e)
    },
    onDragOver: (e: React.DragEvent<HTMLDivElement>): void => {
      if (mentions.isPathDrag(e.dataTransfer)) mentions.pathDragHandlers?.onDragOver(e)
      else dragHandlers.onDragOver(e)
    },
    onDragLeave: (e: React.DragEvent<HTMLDivElement>): void => {
      if (mentions.isPathDrag(e.dataTransfer)) mentions.pathDragHandlers?.onDragLeave(e)
      else dragHandlers.onDragLeave(e)
    },
    onDrop: (e: React.DragEvent<HTMLDivElement>): void => {
      if (mentions.isPathDrag(e.dataTransfer)) mentions.pathDragHandlers?.onDrop(e)
      else dragHandlers.onDrop(e)
    },
  }

  const isDragActive = isDraggingOver || mentions.isPathDragOver

  return (
    <div style={styles.container}>
      <div style={styles.messages}>
        {showPlaceholder && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {placeholder}
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onOptionClick={(option) => handleOptionClick(msg.id, option)}
            hideOptions={dismissedOptions.has(msg.id)}
            connectAbove={msg.role !== 'user' && messages[i - 1] != null && messages[i - 1].role !== 'user'}
            connectBelow={msg.role !== 'user' && messages[i + 1] != null && messages[i + 1].role !== 'user'}
          />
        ))}
        {isThinking && <ThinkingIndicator />}
        {!isThinking && durationMs != null && durationMs > 0 && <DurationBadge durationMs={durationMs} />}
        <div ref={messagesEndRef} />
      </div>
      <div style={styles.inputRow}>
        <div
          style={isDragActive ? { ...styles.inputColumn, ...styles.inputColumnDragOver } : styles.inputColumn}
          onDragEnter={combinedDragHandlers.onDragEnter}
          onDragOver={combinedDragHandlers.onDragOver}
          onDragLeave={combinedDragHandlers.onDragLeave}
          onDrop={combinedDragHandlers.onDrop}
        >
          {mentions.isPathDragOver && (
            <div style={styles.dropHint} role="status">Drop to attach file</div>
          )}
          {acceptImages && isDraggingOver && (
            <div style={styles.dropHint} role="status">Drop image to attach</div>
          )}
          {mentions.isOpen && (
            <ChatMentionDropdown
              suggestions={mentions.suggestions}
              activeIndex={mentions.activeIndex}
              onHover={mentions.setActiveIndex}
              onSelect={mentions.choose}
            />
          )}
          {acceptImages && images.length > 0 && (
            <div style={styles.thumbnailStrip} data-testid="paste-thumbnails">
              {images.map((img) => (
                <div key={img.id} style={styles.thumbnailItem}>
                  <img src={img.dataUrl} alt="Pasted attachment" style={styles.thumbnailImage} />
                  <button
                    type="button"
                    style={styles.thumbnailRemove}
                    onClick={() => removeImage(img.id)}
                    aria-label="Remove image"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
              <span style={styles.thumbnailCounter}>{images.length}/{MAX_PASTED_IMAGES}</span>
            </div>
          )}
          {acceptImages && pasteNotice && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '0 4px' }} role="status">
              {pasteNotice}
            </div>
          )}
          <textarea
            ref={inputRef}
            style={styles.input}
            rows={1}
            value={input}
            onChange={(e) => { setInput(e.target.value); mentions.refresh() }}
            onKeyDown={handleInputKeyDown}
            onBlur={mentions.close}
            onSelect={mentions.refresh}
            placeholder="Tell the agent what to change..."
          />
        </div>
        <button
          style={isThinking ? styles.interruptButton : styles.sendButton}
          onClick={isThinking ? onInterrupt : handleSend}
          aria-label={isThinking ? 'Stop' : 'Send'}
          title={isThinking ? 'Stop' : 'Send'}
        >
          {isThinking ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect width="12" height="12" rx="1.5" fill="currentColor" />
            </svg>
          ) : 'Send'}
        </button>
      </div>
    </div>
  )
}
