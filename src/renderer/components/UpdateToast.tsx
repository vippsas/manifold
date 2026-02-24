import React from 'react'
import { toastStyles } from './UpdateToast.styles'

interface UpdateToastProps {
  version: string | null
  onRestart: () => void
  onDismiss: () => void
}

export function UpdateToast({ version, onRestart, onDismiss }: UpdateToastProps): React.JSX.Element {
  return (
    <div style={toastStyles.container} role="alert">
      <div style={toastStyles.header}>
        <span style={toastStyles.title}>Update available</span>
        <button onClick={onDismiss} style={toastStyles.dismissButton} title="Dismiss">
          &times;
        </button>
      </div>
      <div style={toastStyles.body}>
        Manifold v{version ?? 'latest'} is ready. Restart to update.
      </div>
      <div style={toastStyles.footer}>
        <button onClick={onRestart} style={toastStyles.restartButton}>
          Restart
        </button>
      </div>
    </div>
  )
}
