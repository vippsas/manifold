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

  const searchSurfaceTitle = mode === 'everything'
    ? 'Search across code, sessions, and project memory'
    : mode === 'memory'
      ? 'Search memory, summaries, and interactions'
      : 'Search code in the selected workspace scope'

  const searchSurfaceHint = mode === 'everything'
    ? 'Ask AI turns retrieved matches into a grounded answer with citations.'
    : mode === 'memory'
      ? 'Use questions or keywords to explore observations, summaries, and prior decisions.'
      : 'Use direct terms for exact hits, then Ask AI to explain what the retrieved sources mean.'

  return (
    <>
      <div style={s.searchHeader}>
        <div style={s.searchHeaderTop}>
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
              label={isCurrentSaved ? 'Pinned' : 'Pin'}
              active={isCurrentSaved}
              disabled={!canSaveCurrent}
              onClick={onToggleSaveCurrent}
            />
          </div>
        </div>

        <div style={s.searchSurface}>
          <div style={s.searchSurfaceMeta}>
            <div style={s.searchSurfaceCopy}>
              <span style={s.searchSurfaceEyebrow}>{searchSurfaceTitle}</span>
              <span style={s.searchSurfaceHint}>{searchSurfaceHint}</span>
            </div>

            {mode !== 'memory' && (
              <label style={s.scopeField}>
                <span style={s.scopeLabel}>Scope</span>
                <select
                  style={s.select}
                  value={scopeKind}
                  onChange={(event) => onScopeChange(event.target.value as SearchScopeKind)}
                >
                  {scopeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div style={s.queryRow}>
            <div style={s.queryInputWrap}>
              <input
                ref={inputRef}
                type="text"
                style={s.input}
                placeholder={placeholder}
                value={query}
                onKeyDown={onInputKeyDown}
                onChange={(event) => onQueryChange(event.target.value)}
              />
            </div>

            <PrimaryButton
              label={isAsking ? 'Asking...' : 'Ask AI'}
              disabled={!canAskAi}
              loading={isAsking}
              onClick={onAskAi}
            />
          </div>

          {mode !== 'memory' && (
            <div style={s.controlsRow}>
              <div style={s.toggleGroup}>
                <ToggleButton
                  label={matchMode === 'literal' ? 'Literal' : 'Regex'}
                  active={matchMode === 'regex'}
                  onClick={onToggleMatchMode}
                />
                <ToggleButton
                  label="Case Sensitive"
                  active={caseSensitive}
                  onClick={onToggleCaseSensitive}
                />
                <ToggleButton
                  label="Whole Word"
                  active={wholeWord}
                  onClick={onToggleWholeWord}
                />
              </div>
            </div>
          )}
        </div>
      </div>
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
      style={{
        ...s.utilityButton,
        ...(active ? s.utilityButtonActive : {}),
        ...(disabled ? s.buttonDisabled : {}),
      }}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  )
}

function PrimaryButton({
  label,
  disabled = false,
  loading = false,
  onClick,
}: {
  label: string
  disabled?: boolean
  loading?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      style={{
        ...s.primaryButton,
        ...(loading ? s.primaryButtonLoading : {}),
        ...(!loading && disabled ? s.primaryButtonDisabled : {}),
      }}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
    >
      <span style={s.primaryButtonContent}>
        {loading && <span className="spinner" aria-hidden="true" />}
        <span>{label}</span>
      </span>
    </button>
  )
}
