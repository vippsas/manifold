import React from 'react'
import type { Project } from '../../../shared/types'
import { modalStyles } from '../NewTaskModal.styles'

export function ProjectDropdown({
  value,
  onChange,
  projects,
}: {
  value: string
  onChange: (v: string) => void
  projects: Project[]
}): React.JSX.Element {
  return (
    <label style={modalStyles.label}>
      Project
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={modalStyles.select}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  )
}
