import React from 'react'
import type { AgentRuntime } from '../../../shared/types'
import { modalStyles } from '../modals/NewTaskModal.styles'

export function AgentDropdown({
  value,
  onChange,
  runtimes,
}: {
  value: string
  onChange: (v: string) => void
  runtimes: AgentRuntime[]
}): React.JSX.Element {
  return (
    <label style={modalStyles.label}>
      Agent
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={modalStyles.select}
      >
        {runtimes.map((rt) => (
          <option key={rt.id} value={rt.id}>
            {rt.name}{rt.installed === false ? ' (not installed)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
