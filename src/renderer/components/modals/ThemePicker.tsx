import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { ThemeMeta } from '../../../shared/themes/types'
import { getThemeList, loadTheme } from '../../../shared/themes/registry'
import { applyThemeCssVars } from '../../../shared/themes/adapter'
import { loader } from '@monaco-editor/react'
import { pickerStyles } from './ThemePicker.styles'

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

  useEffect(() => { setSelectedIndex(0) }, [filter, search])
  useEffect(() => { inputRef.current?.focus() }, [])

  const applyPreview = useCallback((themeId: string) => {
    setPreviewedId(themeId)
    const theme = loadTheme(themeId)
    applyThemeCssVars(theme.cssVars)
    void loader.init().then((monaco) => {
      monaco.editor.defineTheme(themeId, theme.monacoTheme as Parameters<typeof monaco.editor.defineTheme>[1])
      monaco.editor.setTheme(themeId)
    })
    window.electronAPI.send('theme:changed', { type: theme.type, background: theme.cssVars['--bg-primary'] })
    onPreview?.(themeId)
  }, [onPreview])

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

  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const item = container.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <div style={pickerStyles.wrapper} onKeyDown={handleKeyDown}>
      <input
        ref={inputRef} type="text" value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search themes..." style={pickerStyles.searchInput}
      />
      <FilterBar filter={filter} onSetFilter={setFilter} />
      <div ref={listRef} style={pickerStyles.list}>
        {filtered.map((theme, index) => (
          <ThemeListItem
            key={theme.id} theme={theme}
            isSelected={index === selectedIndex}
            isCurrent={theme.id === currentThemeId}
            onMouseEnter={() => { setSelectedIndex(index); applyPreview(theme.id) }}
            onClick={() => { setSelectedIndex(index); onSelect(theme.id) }}
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

function FilterBar({ filter, onSetFilter }: { filter: FilterTab; onSetFilter: (tab: FilterTab) => void }): React.JSX.Element {
  return (
    <div style={pickerStyles.filterBar}>
      {(['all', 'dark', 'light'] as FilterTab[]).map((tab) => (
        <button
          key={tab}
          style={{ ...pickerStyles.filterTab, ...(filter === tab ? pickerStyles.filterTabActive : {}) }}
          onClick={() => onSetFilter(tab)}
        >
          {tab.charAt(0).toUpperCase() + tab.slice(1)}
        </button>
      ))}
    </div>
  )
}

interface ThemeListItemProps {
  theme: ThemeMeta
  isSelected: boolean
  isCurrent: boolean
  onMouseEnter: () => void
  onClick: () => void
}

function ThemeListItem({ theme, isSelected, isCurrent, onMouseEnter, onClick }: ThemeListItemProps): React.JSX.Element {
  const swatch = useMemo(() => {
    const t = loadTheme(theme.id)
    return { bg: t.cssVars['--bg-primary'], fg: t.cssVars['--text-primary'], accent: t.cssVars['--accent'] }
  }, [theme.id])

  return (
    <div
      style={{ ...pickerStyles.item, ...(isSelected ? pickerStyles.itemSelected : {}) }}
      onMouseEnter={onMouseEnter} onClick={onClick}
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
