import React from 'react'
import type { ObservationType } from '../../../../shared/memory-types'
import { searchPanelStyles as s } from '../SearchPanel.styles'
import { OBSERVATION_CONCEPTS, OBSERVATION_TYPES, OBSERVATION_TYPE_LABELS } from '../../memory/panel/memory-panel-config'

interface SearchMemoryFiltersProps {
  typeFilter: ObservationType | null
  conceptFilter: string | null
  onToggleType: (type: ObservationType) => void
  onToggleConcept: (concept: string) => void
}

export function SearchMemoryFilters({
  typeFilter,
  conceptFilter,
  onToggleType,
  onToggleConcept,
}: SearchMemoryFiltersProps): React.JSX.Element {
  return (
    <div style={s.filterSection}>
      <div style={s.filterRow}>
        <span style={s.filterLabel}>Type</span>
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

      <div style={s.filterRow}>
        <span style={s.filterLabel}>Concept</span>
        {OBSERVATION_CONCEPTS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            style={{ ...s.filterChip, ...(conceptFilter === value ? s.filterChipActive : {}) }}
            onClick={() => onToggleConcept(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
