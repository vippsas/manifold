import React, { useEffect, useMemo, useRef, useState } from 'react'
import { fuzzyFilter } from './fuzzy-match'
import { useAutoFocus } from '../../../hooks/useAutoFocus'
import { quickOpenStyles } from './QuickOpen.styles'

interface QuickOpenProps {
  visible: boolean
  sessionId: string | null
  worktreeRoot: string | null
  onSelect: (absolutePath: string) => void
  onClose: () => void
}

const MAX_RESULTS = 50

export function QuickOpen({ visible, sessionId, worktreeRoot, onSelect, onClose }: QuickOpenProps): React.JSX.Element | null {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!visible || !sessionId) return
    setQuery('')
    setActiveIndex(0)
    setFiles([])
    setLoading(true)
    let cancelled = false
    void (async (): Promise<void> => {
      try {
        const list = (await window.electronAPI.invoke('files:list', sessionId)) as string[]
        if (!cancelled) setFiles(list)
      } catch {
        if (!cancelled) setFiles([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [visible, sessionId])

  useAutoFocus(visible, inputRef)

  const results = useMemo(() => fuzzyFilter(query, files, MAX_RESULTS), [query, files])

  useEffect(() => { setActiveIndex(0) }, [query])

  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const item = container.children[activeIndex] as HTMLElement | undefined
    item?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex])

  if (!visible) return null

  const choose = (relativePath: string): void => {
    if (!worktreeRoot) return
    onSelect(`${worktreeRoot.replace(/\/$/, '')}/${relativePath}`)
  }

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const choice = results[activeIndex]
      if (choice) choose(choice)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div style={quickOpenStyles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div style={quickOpenStyles.panel}>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Go to file…"
          aria-label="Go to file"
          style={quickOpenStyles.input}
        />
        <ul ref={listRef} style={quickOpenStyles.list} role="listbox">
          {loading ? (
            <li style={quickOpenStyles.empty}>Searching…</li>
          ) : results.length === 0 ? (
            <li style={quickOpenStyles.empty}>No files.</li>
          ) : (
            results.map((relativePath, index) => (
              <li
                key={relativePath}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => { event.preventDefault(); choose(relativePath) }}
                onMouseEnter={() => setActiveIndex(index)}
                style={{ ...quickOpenStyles.item, ...(index === activeIndex ? quickOpenStyles.itemActive : {}) }}
              >
                {relativePath}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
