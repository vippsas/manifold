import React, { useCallback, useRef, useState, useMemo } from 'react'
import type { UiRequest, QuickPickItem } from '../../../shared/plugins/ui'
import { createDialogStyles } from '../workbench-style-primitives'
import { useAutoFocus } from '../../hooks/useAutoFocus'

type QuickPickReq = Extract<UiRequest, { kind: 'quickPick' }>

const styles = createDialogStyles('480px')

const extraStyles: Record<string, React.CSSProperties> = {
  filterInput: {
    ...styles.input,
    width: '100%',
    boxSizing: 'border-box',
  },
  list: {
    maxHeight: '280px',
    overflowY: 'auto' as const,
    margin: '0 calc(-1 * var(--space-lg))',
    borderTop: '1px solid var(--border)',
  },
  item: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    padding: 'var(--space-sm) var(--space-lg)',
    cursor: 'pointer',
  },
  itemActive: {
    background: 'var(--selection-bg, color-mix(in srgb, var(--accent), transparent 85%))',
  },
  itemLabel: {
    fontSize: 'var(--type-ui)',
    color: 'var(--text-primary)',
  },
  itemDescription: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-secondary)',
  },
  itemDetail: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
  },
  emptyState: {
    padding: 'var(--space-lg)',
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
  },
}

interface QuickPickModalProps {
  req: QuickPickReq
  onPick: (item: QuickPickItem | undefined) => void
}

export function QuickPickModal({ req, onPick }: QuickPickModalProps): React.JSX.Element {
  const [filter, setFilter] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useAutoFocus(true, inputRef)

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return req.items
    return req.items.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        (it.description?.toLowerCase().includes(q) ?? false),
    )
  }, [filter, req.items])

  // Clamp active index when filtered list shrinks
  const clampedIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1))

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setFilter(e.target.value)
    setActiveIndex(0)
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Escape') {
        onPick(undefined)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const item = filtered[clampedIndex]
        if (item) onPick(item)
      }
    },
    [filtered, clampedIndex, onPick],
  )

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target === overlayRef.current) onPick(undefined)
    },
    [onPick],
  )

  const title = req.options.title

  return (
    <div
      ref={overlayRef}
      style={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Quick Pick'}
    >
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div style={styles.header}>
            <span style={styles.title}>{title}</span>
          </div>
        )}
        <div style={styles.body}>
          <input
            ref={inputRef}
            type="text"
            style={extraStyles.filterInput}
            placeholder={req.options.placeholder ?? 'Type to filter…'}
            value={filter}
            onChange={handleFilterChange}
            onKeyDown={handleKeyDown}
            aria-label="Filter items"
            autoComplete="off"
          />
          <div style={extraStyles.list} role="listbox">
            {filtered.length === 0 ? (
              <div style={extraStyles.emptyState}>No items match</div>
            ) : (
              filtered.map((item, idx) => (
                <div
                  key={item.label}
                  role="option"
                  aria-selected={idx === clampedIndex}
                  style={{
                    ...extraStyles.item,
                    ...(idx === clampedIndex ? extraStyles.itemActive : undefined),
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => onPick(item)}
                >
                  <span style={extraStyles.itemLabel}>{item.label}</span>
                  {item.description && (
                    <span style={extraStyles.itemDescription}>{item.description}</span>
                  )}
                  {item.detail && (
                    <span style={extraStyles.itemDetail}>{item.detail}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
