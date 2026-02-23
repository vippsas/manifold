import React from 'react'
import { modalStyles } from '../NewTaskModal.styles'

export function ModalHeader({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div style={modalStyles.header}>
      <span style={modalStyles.title}>New Task</span>
      <button type="button" onClick={onClose} style={modalStyles.closeButton} aria-label="Close">
        &times;
      </button>
    </div>
  )
}
