import React, { useState } from 'react'
import { titleBarStyles as styles } from './TitleBar.styles'
import { TitleBarSearch, type TitleBarSearchWiring } from './TitleBarSearch'

type ThemeFamily = 'manifold' | 'garfield' | 'neon' | 'royal' | 'jade' | 'platinum'

interface TitleBarProps {
  projectName?: string
  themeType?: 'dark' | 'light'
  onToggleTheme?: () => void
  themeFamily?: ThemeFamily
  onSelectThemeFamily?: (family: ThemeFamily) => void
  search?: TitleBarSearchWiring
  /** Opens the global Dashboard home surface. Omitted before a project exists. */
  onOpenDashboard?: () => void
}

const THEME_FAMILIES: { id: ThemeFamily; label: string }[] = [
  { id: 'manifold', label: 'Manifold' },
  { id: 'garfield', label: 'Garfield' },
  { id: 'neon', label: 'Neon' },
  { id: 'royal', label: 'Royal' },
  { id: 'jade', label: 'Jade' },
  { id: 'platinum', label: 'Platinum' },
]

export function TitleBar({ projectName, themeType, onToggleTheme, themeFamily, onSelectThemeFamily, search, onOpenDashboard }: TitleBarProps): React.JSX.Element {
  const [themeHovered, setThemeHovered] = useState(false)
  const [themesHovered, setThemesHovered] = useState(false)
  const [dashHovered, setDashHovered] = useState(false)

  return (
    <div style={styles.container}>
      <div style={styles.leftGroup}>
        <div style={styles.trafficLightSpacer} />
        {onOpenDashboard && (
          <button
            type="button"
            onClick={onOpenDashboard}
            onMouseEnter={() => setDashHovered(true)}
            onMouseLeave={() => setDashHovered(false)}
            style={{ ...styles.dashboardButton, ...(dashHovered ? styles.dashboardButtonHover : undefined) }}
            title="Dashboard"
            aria-label="Open Dashboard"
          >
            <span aria-hidden style={styles.dashboardIcon}>⊞</span> Dashboard
          </button>
        )}
        <div style={styles.titleArea}>
          {!projectName && <span style={styles.title}>Manifold</span>}
        </div>
      </div>
      {search?.activeProjectId && <TitleBarSearch search={search} />}
      <div style={styles.rightGroup}>
        {themeFamily && onSelectThemeFamily && (
          <label style={styles.themesGroup}>
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
    </div>
  )
}
