import React from 'react'
import { modalStyles } from '../NewTaskModal.styles'

export function AdvancedSection({
  show,
  onToggle,
  branchName,
  onBranchChange,
  projectName,
}: {
  show: boolean
  onToggle: () => void
  branchName: string
  onBranchChange: (v: string) => void
  projectName: string
}): React.JSX.Element {
  return (
    <div>
      <button type="button" onClick={onToggle} style={modalStyles.advancedToggle}>
        <span style={{ transform: show ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>
          {'\u25B8'}
        </span>
        Advanced
      </button>
      {show && (
        <div style={{ marginTop: '8px' }}>
          <label style={modalStyles.label}>
            Branch
            <input
              type="text"
              value={branchName}
              onChange={(e) => onBranchChange(e.target.value)}
              style={modalStyles.input}
              placeholder={`${projectName.toLowerCase()}/...`}
            />
          </label>
        </div>
      )}
    </div>
  )
}
