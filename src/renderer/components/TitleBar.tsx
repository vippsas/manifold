import React, { useCallback, useState } from 'react'
import { titleBarStyles as styles } from './TitleBar.styles'
import { ConfirmDialog } from './ConfirmDialog'

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
  const [showConfirm, setShowConfirm] = useState(false)
  const isAgentRunning = activeSessionStatus === 'running'

  const doSwitch = useCallback(() => {
    void window.electronAPI.invoke(
      'app:switch-mode',
      'simple',
      activeSessionProjectId,
      activeSessionId,
      activeSessionRuntimeId,
    )
  }, [activeSessionProjectId, activeSessionId, activeSessionRuntimeId])

  const handleSwitchMode = useCallback(() => {
    if (isAgentRunning) {
      setShowConfirm(true)
    } else {
      doSwitch()
    }
  }, [isAgentRunning, doSwitch])

  const buttonStyle: React.CSSProperties = {
    ...styles.button,
    ...(hovered && {
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
        title="Switch to Simple View"
        onClick={handleSwitchMode}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span style={styles.buttonIcon}>◐</span>
        Simple View
      </button>
      {showConfirm && (
        <ConfirmDialog
          title="Switch to Simple View"
          message="Running agents will be stopped. Do you want to continue?"
          confirmLabel="Switch"
          onConfirm={() => { setShowConfirm(false); doSwitch() }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}
