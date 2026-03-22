import React, { useCallback } from 'react'
import type { SearchAiSettings } from '../../../../shared/types'
import { modalStyles } from '../SettingsModal.styles'
import { SEARCH_RUNTIME_OPTIONS } from './runtime-options'

interface SearchAiSettingsSectionProps {
  value: SearchAiSettings
  onChange: (value: SearchAiSettings) => void
}

export function SearchAiSettingsSection({
  value,
  onChange,
}: SearchAiSettingsSectionProps): React.JSX.Element {
  const handleNumberChange = useCallback((key: 'citationLimit' | 'maxContextResults', rawValue: string): void => {
    const parsed = Number.parseInt(rawValue, 10)
    if (!Number.isFinite(parsed) || parsed < 1) return
    onChange({ ...value, [key]: parsed })
  }, [onChange, value])

  return (
    <>
      <label style={{ ...modalStyles.label, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
          style={{ width: 'auto', margin: 0 }}
        />
        Enable AI search
      </label>

      <label style={modalStyles.label}>
        AI Search Mode
        <select
          value={value.mode}
          onChange={(event) => onChange({ ...value, mode: event.target.value as SearchAiSettings['mode'] })}
          style={modalStyles.select}
        >
          <option value="answer">Grounded answers</option>
          <option value="rerank">Rerank exact results</option>
        </select>
        <span style={modalStyles.helpText}>
          Answer mode powers Ask AI. Rerank mode reorders exact search results but does not synthesize an answer.
        </span>
      </label>

      <label style={modalStyles.label}>
        Search AI Runtime
        <select
          value={value.runtimeId}
          onChange={(event) => onChange({ ...value, runtimeId: event.target.value })}
          style={modalStyles.select}
        >
          {SEARCH_RUNTIME_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>

      <label style={modalStyles.label}>
        Citation Limit
        <input
          type="number"
          value={value.citationLimit}
          onChange={(event) => handleNumberChange('citationLimit', event.target.value)}
          min={1}
          max={12}
          step={1}
          style={modalStyles.input}
        />
      </label>

      <label style={modalStyles.label}>
        AI Context Results
        <input
          type="number"
          value={value.maxContextResults}
          onChange={(event) => handleNumberChange('maxContextResults', event.target.value)}
          min={1}
          max={20}
          step={1}
          style={modalStyles.input}
        />
        <span style={modalStyles.helpText}>
          Controls how many retrieved results are sent to AI for answers or reranking.
        </span>
      </label>
    </>
  )
}
