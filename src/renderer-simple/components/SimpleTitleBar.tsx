import React, { useCallback, useState } from 'react'
import * as styles from './SimpleTitleBar.styles'
import { ConfirmDialog } from './ConfirmDialog'

interface SimpleTitleBarProps {
  projectId?: string
  sessionId?: string
  runtimeId?: string
  disabled?: boolean
  onBack?: () => void
  themeType?: 'dark' | 'light'
  onToggleTheme?: () => void
}

export function SimpleTitleBar({
  projectId,
  sessionId,
  runtimeId,
  disabled,
  onBack,
  themeType,
  onToggleTheme,
}: SimpleTitleBarProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  const [themeHovered, setThemeHovered] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const doSwitch = useCallback(() => {
    void window.electronAPI.invoke(
      'app:switch-mode',
      'developer',
      projectId,
      sessionId,
      runtimeId,
    )
  }, [projectId, sessionId, runtimeId])

  const handleSwitchMode = useCallback(() => {
    if (disabled) {
      setShowConfirm(true)
    } else {
      doSwitch()
    }
  }, [disabled, doSwitch])

  const buttonStyle: React.CSSProperties = {
    ...styles.button,
    ...(hovered && {
      color: 'var(--text-primary, var(--text))',
      background: 'rgba(255, 255, 255, 0.08)',
    }),
  }

  const themeToggleStyle: React.CSSProperties = {
    ...styles.themeToggle,
    ...(themeHovered && {
      color: 'var(--text-primary, var(--text))',
      background: 'rgba(255, 255, 255, 0.08)',
    }),
  }

  return (
    <div style={styles.container}>
      <div style={styles.trafficLightSpacer} />
      {onBack && (
        <button
          type="button"
          style={styles.backButton}
          onClick={onBack}
          title="Back to Dashboard"
        >
          ← Dashboard
        </button>
      )}
      <div style={styles.title}>Manifold</div>
      <button
        type="button"
        style={buttonStyle}
        title="Switch to Developer View"
        onClick={handleSwitchMode}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span style={styles.buttonIcon}>◐</span>
        Developer View
      </button>
      {onToggleTheme && (
        <button
          type="button"
          style={themeToggleStyle}
          title={themeType === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
          aria-label={themeType === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
          onClick={onToggleTheme}
          onMouseEnter={() => setThemeHovered(true)}
          onMouseLeave={() => setThemeHovered(false)}
        >
          {themeType === 'dark' ? '☀' : '☾'}
        </button>
      )}
      {showConfirm && (
        <ConfirmDialog
          title="Switch to Developer View"
          message="Running agents will be stopped. Do you want to continue?"
          confirmLabel="Switch"
          onConfirm={() => { setShowConfirm(false); doSwitch() }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}
