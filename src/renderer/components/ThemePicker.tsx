import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { ThemeMeta } from '../../shared/themes/types'
import { getThemeList, loadTheme } from '../../shared/themes/registry'
import { applyThemeCssVars } from '../../shared/themes/adapter'
import { loader } from '@monaco-editor/react'

type FilterTab = 'all' | 'dark' | 'light'

interface ThemePickerProps {
  currentThemeId: string
  onSelect: (themeId: string) => void
  onCancel: () => void
  onPreview?: (themeId: string | null) => void
}

export function ThemePicker({ currentThemeId, onSelect, onCancel, onPreview }: ThemePickerProps): React.JSX.Element {
  const themes = useMemo(() => getThemeList(), [])
  const [filter, setFilter] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [previewedId, setPreviewedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const originalThemeIdRef = useRef(currentThemeId)

  const filtered = useMemo(() => {
    let list = themes
    if (filter !== 'all') list = list.filter((t) => t.type === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((t) => t.label.toLowerCase().includes(q))
    }
    return list
  }, [themes, filter, search])

  // Reset selection when filter/search changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [filter, search])

  // Auto-focus search input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Live preview
  const applyPreview = useCallback((themeId: string) => {
    setPreviewedId(themeId)
    const theme = loadTheme(themeId)
    applyThemeCssVars(theme.cssVars)

    // Update Monaco theme
    void loader.init().then((monaco) => {
      monaco.editor.defineTheme(themeId, theme.monacoTheme as Parameters<typeof monaco.editor.defineTheme>[1])
      monaco.editor.setTheme(themeId)
    })

    // Notify main process for window background
    window.electronAPI.send('theme:changed', { type: theme.type, background: theme.cssVars['--bg-primary'] })

    // Update terminal themes via React state
    onPreview?.(themeId)
  }, [onPreview])

  // Revert preview
  const revertPreview = useCallback(() => {
    const origId = originalThemeIdRef.current
    const theme = loadTheme(origId)
    applyThemeCssVars(theme.cssVars)
    void loader.init().then((monaco) => {
      monaco.editor.defineTheme(origId, theme.monacoTheme as Parameters<typeof monaco.editor.defineTheme>[1])
      monaco.editor.setTheme(origId)
    })
    window.electronAPI.send('theme:changed', { type: theme.type, background: theme.cssVars['--bg-primary'] })
    onPreview?.(null)
  }, [onPreview])

  const handleConfirm = useCallback(() => {
    const theme = filtered[selectedIndex]
    if (theme) onSelect(theme.id)
  }, [filtered, selectedIndex, onSelect])

  const handleCancel = useCallback(() => {
    revertPreview()
    onCancel()
  }, [revertPreview, onCancel])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => {
          const next = Math.min(i + 1, filtered.length - 1)
          applyPreview(filtered[next].id)
          return next
        })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => {
          const next = Math.max(i - 1, 0)
          applyPreview(filtered[next].id)
          return next
        })
      } else if (e.key === 'Enter') {
        e.preventDefault()
        handleConfirm()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleCancel()
      }
    },
    [filtered, applyPreview, handleConfirm, handleCancel]
  )

  // Scroll selected item into view
  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const item = container.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <div style={pickerStyles.wrapper} onKeyDown={handleKeyDown}>
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search themes..."
        style={pickerStyles.searchInput}
      />
      <div style={pickerStyles.filterBar}>
        {(['all', 'dark', 'light'] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            style={{
              ...pickerStyles.filterTab,
              ...(filter === tab ? pickerStyles.filterTabActive : {}),
            }}
            onClick={() => setFilter(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      <div ref={listRef} style={pickerStyles.list}>
        {filtered.map((theme, index) => (
          <ThemeListItem
            key={theme.id}
            theme={theme}
            isSelected={index === selectedIndex}
            isCurrent={theme.id === currentThemeId}
            isPreviewed={theme.id === previewedId}
            onMouseEnter={() => {
              setSelectedIndex(index)
              applyPreview(theme.id)
            }}
            onClick={() => {
              setSelectedIndex(index)
              onSelect(theme.id)
            }}
          />
        ))}
        {filtered.length === 0 && (
          <div style={pickerStyles.empty}>No themes match your search</div>
        )}
      </div>
      <div style={pickerStyles.footer}>
        <span style={pickerStyles.footerHint}>
          {'\u2191\u2193'} Navigate &middot; Enter Confirm &middot; Esc Cancel
        </span>
      </div>
    </div>
  )
}

interface ThemeListItemProps {
  theme: ThemeMeta
  isSelected: boolean
  isCurrent: boolean
  isPreviewed: boolean
  onMouseEnter: () => void
  onClick: () => void
}

function ThemeListItem({ theme, isSelected, isCurrent, onMouseEnter, onClick }: ThemeListItemProps): React.JSX.Element {
  const swatch = useMemo(() => {
    const t = loadTheme(theme.id)
    return {
      bg: t.cssVars['--bg-primary'],
      fg: t.cssVars['--text-primary'],
      accent: t.cssVars['--accent'],
    }
  }, [theme.id])

  return (
    <div
      style={{
        ...pickerStyles.item,
        ...(isSelected ? pickerStyles.itemSelected : {}),
      }}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <div style={pickerStyles.swatchGroup}>
        <div style={{ ...pickerStyles.swatch, background: swatch.bg }} />
        <div style={{ ...pickerStyles.swatch, background: swatch.fg }} />
        <div style={{ ...pickerStyles.swatch, background: swatch.accent }} />
      </div>
      <span style={pickerStyles.itemLabel}>{theme.label}</span>
      {isCurrent && <span style={pickerStyles.currentBadge}>current</span>}
      <span style={pickerStyles.typeBadge}>{theme.type}</span>
    </div>
  )
}

const pickerStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    width: '320px',
    maxHeight: '460px',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    overflow: 'hidden',
  },
  searchInput: {
    margin: '8px 8px 0',
    padding: '6px 8px',
    fontSize: '13px',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    outline: 'none',
  },
  filterBar: {
    display: 'flex',
    gap: '2px',
    padding: '6px 8px',
    borderBottom: '1px solid var(--border)',
  },
  filterTab: {
    flex: 1,
    padding: '3px 0',
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--text-muted)',
    background: 'none',
    border: '1px solid transparent',
    borderRadius: '3px',
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  filterTabActive: {
    color: 'var(--text-primary)',
    background: 'var(--bg-secondary)',
    borderColor: 'var(--border)',
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    maxHeight: '340px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    color: 'var(--text-primary)',
  },
  itemSelected: {
    background: 'var(--bg-secondary)',
  },
  itemLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  currentBadge: {
    fontSize: '10px',
    color: 'var(--accent)',
    fontWeight: 500,
    flexShrink: 0,
  },
  typeBadge: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  swatchGroup: {
    display: 'flex',
    gap: '2px',
    flexShrink: 0,
  },
  swatch: {
    width: '12px',
    height: '12px',
    borderRadius: '2px',
    border: '1px solid var(--border)',
  },
  empty: {
    padding: '16px',
    textAlign: 'center' as const,
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
  footer: {
    padding: '6px 10px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
  },
  footerHint: {
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
}
