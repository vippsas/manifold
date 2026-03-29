import React, { useCallback, useState } from 'react'
import { titleBarStyles as styles } from './TitleBar.styles'

interface TitleBarProps {
  activeSessionProjectId?: string
  activeSessionId?: string | null
  activeSessionRuntimeId?: string
  activeSessionStatus?: string | null
}

export function TitleBar({
  activeSessionProjectId,
  activeSessionId,
  activeSessionRuntimeId,
  activeSessionStatus,
}: TitleBarProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  const isAgentRunning = activeSessionStatus === 'running'

  const handleSwitchMode = useCallback(() => {
    if (isAgentRunning) return
    void window.electronAPI.invoke(
      'app:switch-mode',
      'simple',
      activeSessionProjectId,
      activeSessionId,
      activeSessionRuntimeId,
    )
  }, [isAgentRunning, activeSessionProjectId, activeSessionId, activeSessionRuntimeId])

  const buttonStyle: React.CSSProperties = {
    ...styles.button,
    ...(isAgentRunning && {
      opacity: 0.4,
      cursor: 'not-allowed',
    }),
    ...(!isAgentRunning && hovered && {
      color: 'var(--text-primary)',
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
        title={isAgentRunning ? 'Cannot switch while agent is running' : 'Switch to Simple View'}
        onClick={handleSwitchMode}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span style={styles.buttonIcon}>◐</span>
        Simple View
      </button>
    </div>
  )
}
