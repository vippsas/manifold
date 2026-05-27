import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import type { ChatMessage as ChatMessageType } from '../../shared/simple-types'
import { ChatMessage } from './ChatMessage'
import * as styles from './ChatPane.styles'

const INPUT_LINE_HEIGHT = 22
const INPUT_CHROME_HEIGHT = 26
const MAX_VISIBLE_LINES = 4
const MIN_INPUT_HEIGHT = INPUT_LINE_HEIGHT + INPUT_CHROME_HEIGHT
const MAX_INPUT_HEIGHT = INPUT_LINE_HEIGHT * MAX_VISIBLE_LINES + INPUT_CHROME_HEIGHT

export const MAX_PASTED_IMAGES = 3
const MAX_PASTED_IMAGE_BYTES = 10 * 1024 * 1024
const ACCEPTED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export interface PastedImage {
  id: string
  dataUrl: string
  mime: string
}

const THINKING_PHRASES = [
  'Thinking',
  'Pondering',
  'Reasoning',
  'Connecting dots',
  'Weaving ideas',
  'Exploring paths',
  'Working through it',
  'Diving deep',
  'Piecing it together',
  'Mulling it over',
  'Crafting a response',
  'Mapping it out',
  'Almost there',
  'On it',
]

function pickRandom(phrases: string[], exclude: string): string {
  const filtered = phrases.filter((p) => p !== exclude)
  return filtered[Math.floor(Math.random() * filtered.length)]
}

function ThinkingIndicator(): React.JSX.Element {
  const [phrase, setPhrase] = useState(() =>
    THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)]
  )
  const [visible, setVisible] = useState(true)

  const rotate = useCallback(() => {
    setVisible(false)
    setTimeout(() => {
      setPhrase((prev) => pickRandom(THINKING_PHRASES, prev))
      setVisible(true)
    }, 400)
  }, [])

  useEffect(() => {
    const id = setInterval(rotate, 3000)
    return () => clearInterval(id)
  }, [rotate])

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
      }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--accent)',
              animation: `typing-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            background: 'linear-gradient(90deg, var(--text-muted) 0%, var(--accent-hover) 50%, var(--text-muted) 100%)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'shimmer 2s linear infinite',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}
        >
          {phrase}...
        </span>
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function DurationBadge({ durationMs }: { durationMs: number }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
      <span style={{
        fontSize: 12,
        color: 'var(--text-muted)',
        padding: '4px 12px',
        borderRadius: 12,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}>
        Completed in {formatDuration(durationMs)}
      </span>
    </div>
  )
}

interface Props {
  messages: ChatMessageType[]
  onSend: (text: string, images?: PastedImage[]) => void
  onInterrupt?: () => void
  isThinking?: boolean
  durationMs?: number | null
  placeholder?: React.ReactNode
  acceptImages?: boolean
}

export function ChatPane({ messages, onSend, onInterrupt, isThinking, durationMs, placeholder, acceptImages = false }: Props): React.JSX.Element {
  const [input, setInput] = useState('')
  const [images, setImages] = useState<PastedImage[]>([])
  const [pasteNotice, setPasteNotice] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [dismissedOptions, setDismissedOptions] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pendingSelectionRef = useRef<number | null>(null)
  const dragDepthRef = useRef(0)
  const imageCountRef = useRef(0)

  useEffect(() => {
    imageCountRef.current = images.length
  }, [images])

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
    setImages([])
    imageCountRef.current = 0
    setPasteNotice(null)
  }

  const showPasteNotice = (text: string): void => {
    setPasteNotice(text)
    window.setTimeout(() => setPasteNotice((current) => (current === text ? null : current)), 2500)
  }

  const ingestImageFiles = useCallback((files: File[]): void => {
    if (files.length === 0) return
    const remaining = MAX_PASTED_IMAGES - imageCountRef.current
    if (remaining <= 0) {
      showPasteNotice(`You can attach at most ${MAX_PASTED_IMAGES} images.`)
      return
    }
    if (files.length > remaining) {
      showPasteNotice(`Only the first ${remaining} image${remaining === 1 ? '' : 's'} were added.`)
    }
    const accepted = files.slice(0, remaining)
    for (const file of accepted) {
      if (file.size > MAX_PASTED_IMAGE_BYTES) {
        showPasteNotice('Image too large (max 10MB).')
        continue
      }
      imageCountRef.current += 1
      const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const reader = new FileReader()
      reader.onload = (): void => {
        const result = reader.result
        if (typeof result !== 'string') return
        setImages((current) => {
          if (current.some((img) => img.id === id)) return current
          if (current.length >= MAX_PASTED_IMAGES) return current
          return [...current, { id, dataUrl: result, mime: file.type }]
        })
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const collectImageFiles = (
    items: DataTransferItemList | null | undefined,
    fileList: FileList | null | undefined,
  ): File[] => {
    const collected: File[] = []
    const seen = new Set<File>()
    if (items) {
      for (const item of Array.from(items)) {
        if (item.kind !== 'file') continue
        if (item.type && !item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (!file) continue
        if (file.type && !file.type.startsWith('image/')) continue
        if (!seen.has(file)) {
          seen.add(file)
          collected.push(file)
        }
      }
    }
    if (fileList) {
      for (const file of Array.from(fileList)) {
        if (!file.type.startsWith('image/')) continue
        if (!seen.has(file)) {
          seen.add(file)
          collected.push(file)
        }
      }
    }
    return collected.filter((f) => ACCEPTED_IMAGE_MIME.has(f.type))
  }

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!acceptImages) return
    const types = e.dataTransfer?.types
    if (!types || !Array.from(types).includes('Files')) return
    e.preventDefault()
    dragDepthRef.current += 1
    setIsDraggingOver(true)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!acceptImages) return
    const types = e.dataTransfer?.types
    if (!types || !Array.from(types).includes('Files')) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!acceptImages) return
    e.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDraggingOver(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!acceptImages) return
    e.preventDefault()
    dragDepthRef.current = 0
    setIsDraggingOver(false)
    const imageFiles = collectImageFiles(e.dataTransfer?.items, e.dataTransfer?.files)
    if (imageFiles.length === 0) {
      showPasteNotice('Only PNG, JPEG, GIF, or WebP images are supported.')
      return
    }
    ingestImageFiles(imageFiles)
  }

  useEffect(() => {
    if (!acceptImages) return
    const swallow = (e: DragEvent): void => {
      if (!e.dataTransfer) return
      if (!Array.from(e.dataTransfer.types).includes('Files')) return
      e.preventDefault()
    }
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [acceptImages])

  useEffect(() => {
    if (!acceptImages) return
    const onPaste = (e: ClipboardEvent): void => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || (tag === 'TEXTAREA' && target !== inputRef.current)) return
      if (target?.isContentEditable && target !== inputRef.current) return
      const imageFiles = collectImageFiles(e.clipboardData?.items, e.clipboardData?.files)
      if (imageFiles.length === 0) return
      e.preventDefault()
      ingestImageFiles(imageFiles)
      inputRef.current?.focus()
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [acceptImages, ingestImageFiles])

  const removeImage = (id: string): void => {
    setImages((prev) => {
      const next = prev.filter((img) => img.id !== id)
      imageCountRef.current = next.length
      return next
    })
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

  return (
    <div style={styles.container}>
      <div style={styles.messages}>
        {showPlaceholder && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {placeholder}
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onOptionClick={(option) => handleOptionClick(msg.id, option)}
            hideOptions={dismissedOptions.has(msg.id)}
          />
        ))}
        {isThinking && <ThinkingIndicator />}
        {!isThinking && durationMs != null && durationMs > 0 && <DurationBadge durationMs={durationMs} />}
        <div ref={messagesEndRef} />
      </div>
      <div style={styles.inputRow}>
        <div
          style={isDraggingOver ? { ...styles.inputColumn, ...styles.inputColumnDragOver } : styles.inputColumn}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {acceptImages && isDraggingOver && (
            <div style={styles.dropHint} role="status">Drop image to attach</div>
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
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
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
