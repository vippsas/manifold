import React from 'react'
import type { SearchMode, SearchScopeKind } from '../../../shared/search-types'
import { searchPanelStyles as s } from './SearchPanel.styles'
import type { SearchScopeOption } from './search-panel-utils'

interface SearchPanelControlsProps {
  mode: SearchMode
  query: string
  scopeKind: SearchScopeKind
  matchMode: 'literal' | 'regex'
  caseSensitive: boolean
  wholeWord: boolean
  scopeOptions: SearchScopeOption[]
  inputRef: React.RefObject<HTMLInputElement | null>
  placeholder: string
  canAskAi: boolean
  isAsking: boolean
  canSaveCurrent: boolean
  isCurrentSaved: boolean
  showClearAnswer: boolean
  onInputKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onModeChange: (mode: SearchMode) => void
  onQueryChange: (query: string) => void
  onScopeChange: (scope: SearchScopeKind) => void
  onToggleMatchMode: () => void
  onToggleCaseSensitive: () => void
  onToggleWholeWord: () => void
  onAskAi: () => void
  onToggleSaveCurrent: () => void
  onClearAnswer: () => void
}

export function SearchPanelControls(props: SearchPanelControlsProps): React.JSX.Element {
  const {
    mode,
    query,
    scopeKind,
    matchMode,
    caseSensitive,
    wholeWord,
    scopeOptions,
    inputRef,
    placeholder,
    canAskAi,
    isAsking,
    canSaveCurrent,
    isCurrentSaved,
    showClearAnswer,
    onInputKeyDown,
    onModeChange,
    onQueryChange,
    onScopeChange,
    onToggleMatchMode,
    onToggleCaseSensitive,
    onToggleWholeWord,
    onAskAi,
    onToggleSaveCurrent,
    onClearAnswer,
  } = props

  return (
    <>
      <div style={s.searchHeader}>
        <div style={s.tabBar}>
          <ModeTab mode="code" activeMode={mode} onSelect={onModeChange} />
          <ModeTab mode="memory" activeMode={mode} onSelect={onModeChange} />
          <ModeTab mode="everything" activeMode={mode} onSelect={onModeChange} />
        </div>
        <div style={s.headerActions}>
          {showClearAnswer && (
            <UtilityButton label="Clear" active={false} onClick={onClearAnswer} />
          )}
          <UtilityButton
            label={isCurrentSaved ? 'Saved' : 'Pin'}
            active={isCurrentSaved}
            disabled={!canSaveCurrent}
            onClick={onToggleSaveCurrent}
          />
          <UtilityButton
            label={isAsking ? 'Asking...' : 'Ask AI'}
            active={false}
            disabled={!canAskAi || isAsking}
            onClick={onAskAi}
          />
        </div>
      </div>

      <div style={s.toolbar}>
        <input
          ref={inputRef}
          type="text"
          style={s.input}
          placeholder={placeholder}
          value={query}
          onKeyDown={onInputKeyDown}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {mode !== 'memory' && (
          <select
            style={s.select}
            value={scopeKind}
            onChange={(event) => onScopeChange(event.target.value as SearchScopeKind)}
          >
            {scopeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        )}
      </div>

      {mode !== 'memory' && (
        <div style={s.controlsRow}>
          <ToggleButton
            label={matchMode === 'literal' ? 'Literal' : 'Regex'}
            active={matchMode === 'regex'}
            onClick={onToggleMatchMode}
          />
          <ToggleButton
            label="Case"
            active={caseSensitive}
            onClick={onToggleCaseSensitive}
          />
          <ToggleButton
            label="Word"
            active={wholeWord}
            onClick={onToggleWholeWord}
          />
        </div>
      )}
    </>
  )
}

function ModeTab({
  mode,
  activeMode,
  onSelect,
}: {
  mode: SearchMode
  activeMode: SearchMode
  onSelect: (mode: SearchMode) => void
}): React.JSX.Element {
  return (
    <button
      style={{ ...s.tab, ...(activeMode === mode ? s.tabActive : {}) }}
      onClick={() => onSelect(mode)}
    >
      {mode === 'code' ? 'Code' : mode === 'memory' ? 'Memory' : 'Everything'}
    </button>
  )
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      style={{ ...s.toggle, ...(active ? s.toggleActive : {}) }}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function UtilityButton({
  label,
  active,
  disabled = false,
  onClick,
}: {
  label: string
  active: boolean
  disabled?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      style={{ ...s.toggle, ...(active ? s.toggleActive : {}) }}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  )
}
