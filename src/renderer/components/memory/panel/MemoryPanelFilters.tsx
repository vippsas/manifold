import React from 'react'
import type { ObservationType } from '../../../../shared/memory-types'
import { memoryStyles as s } from '../MemoryPanel.styles'
import { OBSERVATION_CONCEPTS, OBSERVATION_TYPES, OBSERVATION_TYPE_LABELS } from './memory-panel-config'

interface MemoryPanelFiltersProps {
  typeFilter: ObservationType | null
  conceptFilter: string | null
  onToggleType: (type: ObservationType) => void
  onToggleConcept: (concept: string) => void
}

export function MemoryPanelFilters({
  typeFilter,
  conceptFilter,
  onToggleType,
  onToggleConcept,
}: MemoryPanelFiltersProps): React.JSX.Element {
  return (
    <>
      <div style={s.filterBar}>
        {OBSERVATION_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            style={{ ...s.filterChip, ...(typeFilter === type ? s.filterChipActive : {}) }}
            onClick={() => onToggleType(type)}
          >
            {OBSERVATION_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <div style={{ ...s.filterBar, borderBottom: '1px solid var(--border)' }}>
        {OBSERVATION_CONCEPTS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            style={{ ...s.conceptChip, ...(conceptFilter === value ? s.conceptChipActive : {}) }}
            onClick={() => onToggleConcept(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  )
}
