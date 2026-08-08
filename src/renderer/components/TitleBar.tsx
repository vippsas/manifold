import React, { useState } from 'react'
import { titleBarStyles as styles } from './TitleBar.styles'
import { getThemeFamilies } from '../../shared/themes/registry'

interface TitleBarProps {
  projectName?: string
  themeType?: 'dark' | 'light'
  onToggleTheme?: () => void
  /** A theme id without its variant suffix, e.g. `jade`. */
  themeFamily?: string
  onSelectThemeFamily?: (family: string) => void
}

export function TitleBar({
  projectName,
  themeType,
  onToggleTheme,
  themeFamily,
  onSelectThemeFamily,
}: TitleBarProps): React.JSX.Element {
  const [themeHovered, setThemeHovered] = useState(false)
  const [themesHovered, setThemesHovered] = useState(false)

  return (
    <div style={styles.container}>
      <div style={styles.trafficLightSpacer} />
      <div style={styles.titleArea}>
        {!projectName && <span style={styles.title}>Manifold</span>}
      </div>
      <div style={styles.rightGroup}>
        {themeFamily && onSelectThemeFamily && (
          <label style={styles.themesGroup}>
            <select
              value={themeFamily}
              onChange={(e) => onSelectThemeFamily(e.target.value)}
              onMouseEnter={() => setThemesHovered(true)}
              onMouseLeave={() => setThemesHovered(false)}
              style={{ ...styles.themesSelect, ...(themesHovered ? styles.themesSelectHover : undefined) }}
              aria-label="Theme"
            >
              {getThemeFamilies().map((family) => (
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
