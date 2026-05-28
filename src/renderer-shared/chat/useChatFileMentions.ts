import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  findActiveMention,
  applyMention,
  insertMentionAtCursor,
  rankMentionPaths,
  findActiveCommand,
  applyCommand,
  rankCommands,
} from './chat-mention-utils'

const MAX_SUGGESTIONS = 8

export interface FileDropConfig {
  /** True if the drag carries a file-tree path (checked during dragover, where data is unreadable). */
  hasPath: (dataTransfer: DataTransfer | null) => boolean
  /** The relative path carried by the drop, or null. */
  readPath: (dataTransfer: DataTransfer | null) => string | null
}

interface Options {
  /** Relative paths offered by the `@` autocomplete. Undefined disables autocomplete. */
  paths?: string[]
  /** Slash command/skill names offered by the `/` autocomplete. Undefined disables it. */
  commands?: string[]
  /** Enables drag-and-drop of file-tree paths into the composer. Undefined disables it. */
  fileDrop?: FileDropConfig
  input: string
  setInput: (value: string) => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  /** Schedules the caret to move to `pos` after the next input render. */
  requestCursor: (pos: number) => void
}

export interface ChatFileMentions {
  isOpen: boolean
  suggestions: string[]
  activeIndex: number
  setActiveIndex: (index: number) => void
  /** Recompute the open mention from the current textarea state. Call after input changes. */
  refresh: () => void
  /** Handle a keydown while the dropdown is open. Returns true if the key was consumed. */
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
  /** Commit a suggestion into the composer. */
  choose: (path: string) => void
  close: () => void
  isPathDragOver: boolean
  /** Drag handlers for file-tree path drops, or null when file drop is disabled. */
  pathDragHandlers: {
    onDragEnter: (e: React.DragEvent<HTMLDivElement>) => void
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  } | null
  /** True when a drag event carries a file-tree path (used to route combined handlers). */
  isPathDrag: (dataTransfer: DataTransfer | null) => boolean
}

/**
 * Adds `@FILENAME` autocomplete and file-tree drag-and-drop to a chat composer.
 * Both paths insert `@<relative-path>` into the textarea, which Claude Code
 * expands natively when the message is sent.
 */
export function useChatFileMentions({ paths, commands, fileDrop, input, setInput, inputRef, requestCursor }: Options): ChatFileMentions {
  // The open token, kind-tagged: `@` mentions resolve to paths, `/` to commands.
  const [active, setActive] = useState<{ kind: 'mention' | 'command'; query: string } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPathDragOver, setIsPathDragOver] = useState(false)
  const dragDepthRef = useRef(0)

  const suggestions = useMemo(() => {
    if (!active) return []
    if (active.kind === 'command') {
      if (!commands || commands.length === 0) return []
      return rankCommands(commands, active.query, MAX_SUGGESTIONS)
    }
    if (!paths || paths.length === 0) return []
    return rankMentionPaths(paths, active.query, MAX_SUGGESTIONS)
  }, [active, paths, commands])

  const isOpen = active != null && suggestions.length > 0

  const close = useCallback((): void => {
    setActive(null)
    setActiveIndex(0)
  }, [])

  const refresh = useCallback((): void => {
    // Read the textarea directly: during onChange the `input` state still lags.
    const textarea = inputRef.current
    const value = textarea?.value ?? input
    const cursor = textarea?.selectionStart ?? value.length
    const command = commands && commands.length > 0 ? findActiveCommand(value, cursor) : null
    if (command) {
      setActive({ kind: 'command', query: command.query })
      setActiveIndex(0)
      return
    }
    const mention = paths && paths.length > 0 ? findActiveMention(value, cursor) : null
    setActive(mention ? { kind: 'mention', query: mention.query } : null)
    setActiveIndex(0)
  }, [paths, commands, input, inputRef])

  const choose = useCallback((value: string): void => {
    const textarea = inputRef.current
    const text = textarea?.value ?? input
    const cursor = textarea?.selectionStart ?? text.length
    const command = active?.kind === 'command' ? findActiveCommand(text, cursor) : null
    let result: { text: string; cursor: number }
    if (command) {
      result = applyCommand(text, command, value)
    } else {
      const mention = findActiveMention(text, cursor)
      result = mention ? applyMention(text, mention, value) : insertMentionAtCursor(text, cursor, value)
    }
    requestCursor(result.cursor)
    setInput(result.text)
    close()
    textarea?.focus()
  }, [active, input, inputRef, setInput, requestCursor, close])

  // Dropped file-tree paths always insert an `@mention`, regardless of any open token.
  const insertPathMention = useCallback((path: string): void => {
    const textarea = inputRef.current
    const text = textarea?.value ?? input
    const cursor = textarea?.selectionStart ?? text.length
    const mention = findActiveMention(text, cursor)
    const result = mention ? applyMention(text, mention, path) : insertMentionAtCursor(text, cursor, path)
    requestCursor(result.cursor)
    setInput(result.text)
    close()
    textarea?.focus()
  }, [input, inputRef, setInput, requestCursor, close])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!isOpen) return false
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      choose(suggestions[activeIndex])
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return true
    }
    return false
  }, [isOpen, suggestions, activeIndex, choose, close])

  const isPathDrag = useCallback(
    (dataTransfer: DataTransfer | null): boolean => Boolean(fileDrop?.hasPath(dataTransfer)),
    [fileDrop],
  )

  const pathDragHandlers = useMemo(() => {
    if (!fileDrop) return null
    return {
      onDragEnter: (e: React.DragEvent<HTMLDivElement>): void => {
        e.preventDefault()
        dragDepthRef.current += 1
        setIsPathDragOver(true)
      },
      onDragOver: (e: React.DragEvent<HTMLDivElement>): void => {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      },
      onDragLeave: (e: React.DragEvent<HTMLDivElement>): void => {
        e.preventDefault()
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) setIsPathDragOver(false)
      },
      onDrop: (e: React.DragEvent<HTMLDivElement>): void => {
        e.preventDefault()
        e.stopPropagation()
        dragDepthRef.current = 0
        setIsPathDragOver(false)
        const path = fileDrop.readPath(e.dataTransfer)
        if (path) insertPathMention(path)
      },
    }
  }, [fileDrop, insertPathMention])

  return {
    isOpen,
    suggestions,
    activeIndex,
    setActiveIndex,
    refresh,
    handleKeyDown,
    choose,
    close,
    isPathDragOver,
    pathDragHandlers,
    isPathDrag,
  }
}
