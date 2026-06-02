import React, { useState } from 'react'
import { titleBarStyles as styles } from './TitleBar.styles'
import { TitleBarSearch, type TitleBarSearchWiring } from './TitleBarSearch'

type ThemeFamily = 'manifold' | 'garfield' | 'neon'

interface TitleBarProps {
  projectName?: string
  themeType?: 'dark' | 'light'
  onToggleTheme?: () => void
  themeFamily?: ThemeFamily
  onSelectThemeFamily?: (family: ThemeFamily) => void
  search?: TitleBarSearchWiring
}

const THEME_FAMILIES: { id: ThemeFamily; label: string }[] = [
  { id: 'manifold', label: 'Manifold' },
  { id: 'garfield', label: 'Garfield' },
  { id: 'neon', label: 'Neon' },
]

export function TitleBar({ projectName, themeType, onToggleTheme, themeFamily, onSelectThemeFamily, search }: TitleBarProps): React.JSX.Element {
  const [themeHovered, setThemeHovered] = useState(false)
  const [themesHovered, setThemesHovered] = useState(false)

  return (
    <div style={styles.container}>
      <div style={styles.trafficLightSpacer} />
      <div style={styles.titleArea}>
        {!projectName && <span style={styles.title}>Manifold</span>}
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
