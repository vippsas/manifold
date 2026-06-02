import React, { useCallback, useState } from 'react'
import { titleBarStyles as styles } from './TitleBar.styles'
import { TitleBarSearch, type TitleBarSearchWiring } from './TitleBarSearch'

type ThemeFamily = 'manifold' | 'garfield'

interface TitleBarProps {
  projectName?: string
  onRename?: (name: string) => void
  themeType?: 'dark' | 'light'
  onToggleTheme?: () => void
  themeFamily?: ThemeFamily
  onSelectThemeFamily?: (family: ThemeFamily) => void
  search?: TitleBarSearchWiring
}

const THEME_FAMILIES: { id: ThemeFamily; label: string }[] = [
  { id: 'manifold', label: 'Manifold' },
  { id: 'garfield', label: 'Garfield' },
]

export function TitleBar({ projectName, onRename, themeType, onToggleTheme, themeFamily, onSelectThemeFamily, search }: TitleBarProps): React.JSX.Element {
  const editable = Boolean(projectName && onRename)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [hovered, setHovered] = useState(false)
  const [themeHovered, setThemeHovered] = useState(false)
  const [themesHovered, setThemesHovered] = useState(false)

  const startEditing = useCallback((): void => {
    setDraft(projectName ?? '')
    setEditing(true)
  }, [projectName])

  const commit = useCallback((): void => {
    const next = draft.trim()
    if (next && next !== projectName) onRename?.(next)
    setEditing(false)
  }, [draft, projectName, onRename])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setEditing(false)
      }
    },
    [commit]
  )

  return (
    <div style={styles.container}>
      <div style={styles.trafficLightSpacer} />
      <div style={styles.titleArea}>
        {!editable ? (
          <span style={styles.title}>Manifold</span>
        ) : editing ? (
          <input
            ref={(el) => el?.select()}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            style={styles.titleInput}
            aria-label="Project name"
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ ...styles.titleButton, ...(hovered ? styles.titleButtonHover : undefined) }}
            title="Click to rename"
          >
            {projectName}
          </button>
        )}
      </div>
      <div style={styles.sideSpacer} />
      {search?.activeProjectId && <TitleBarSearch search={search} />}
      <div style={styles.sideSpacer} />
      {themeFamily && onSelectThemeFamily && (
        <label style={styles.themesGroup}>
          <span style={styles.themesLabel}>Themes</span>
          <select
            value={themeFamily}
            onChange={(e) => onSelectThemeFamily(e.target.value as ThemeFamily)}
            onMouseEnter={() => setThemesHovered(true)}
            onMouseLeave={() => setThemesHovered(false)}
            style={{ ...styles.themesSelect, ...(themesHovered ? styles.themesSelectHover : undefined) }}
            aria-label="Theme"
          >
            {THEME_FAMILIES.map((family) => (
              <option key={family.id} value={family.id}>
                {family.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {onToggleTheme && (
        <button
          type="button"
          onClick={onToggleTheme}
          onMouseEnter={() => setThemeHovered(true)}
          onMouseLeave={() => setThemeHovered(false)}
          style={{ ...styles.themeToggle, ...(themeHovered ? styles.themeToggleHover : undefined) }}
          title={themeType === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
          aria-label={themeType === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
        >
          {themeType === 'dark' ? '☀' : '☾'}
        </button>
      )}
    </div>
  )
}
