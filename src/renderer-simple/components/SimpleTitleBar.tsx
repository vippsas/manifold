import React, { useCallback, useState } from 'react'
import * as styles from './SimpleTitleBar.styles'

interface SimpleTitleBarProps {
  projectId?: string
  sessionId?: string
  runtimeId?: string
  disabled?: boolean
}

export function SimpleTitleBar({
  projectId,
  sessionId,
  runtimeId,
  disabled,
}: SimpleTitleBarProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false)

  const handleSwitchMode = useCallback(() => {
    if (disabled) return
    void window.electronAPI.invoke(
      'app:switch-mode',
      'developer',
      projectId,
      sessionId,
      runtimeId,
    )
  }, [disabled, projectId, sessionId, runtimeId])

  const buttonStyle: React.CSSProperties = {
    ...styles.button,
    ...(disabled && {
      opacity: 0.4,
      cursor: 'not-allowed',
    }),
    ...(!disabled && hovered && {
      color: 'var(--text-primary, var(--text))',
      background: 'rgba(255, 255, 255, 0.08)',
    }),
  }

  return (
    <div style={styles.container}>
      <div style={styles.trafficLightSpacer} />
      <div style={styles.title}>Manifold</div>
      <button
        type="button"
        style={buttonStyle}
        title={disabled ? 'Cannot switch while agent is running' : 'Switch to Developer View'}
        onClick={handleSwitchMode}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span style={styles.buttonIcon}>◐</span>
        Developer View
      </button>
    </div>
  )
}
