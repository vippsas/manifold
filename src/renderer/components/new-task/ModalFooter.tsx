import React from 'react'
import { modalStyles } from '../NewTaskModal.styles'

export function ModalFooter({
  onClose,
  canSubmit,
  loading,
}: {
  onClose: () => void
  canSubmit: boolean
  loading: boolean
}): React.JSX.Element {
  return (
    <div style={modalStyles.footer}>
      <button type="button" onClick={onClose} style={modalStyles.cancelButton}>
        Cancel
      </button>
      <button
        type="submit"
        disabled={!canSubmit || loading}
        style={{
          ...modalStyles.startButton,
          opacity: !canSubmit || loading ? 0.5 : 1,
          cursor: !canSubmit || loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Starting\u2026' : 'Start Task \u2192'}
      </button>
    </div>
  )
}
