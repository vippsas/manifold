import React from 'react'
import type { PRInfo } from '../../../shared/types'
import { modalStyles } from '../NewTaskModal.styles'

export function PRPicker({
  prs,
  filter,
  onFilterChange,
  selected,
  onSelect,
  loading,
}: {
  prs: PRInfo[]
  filter: string
  onFilterChange: (v: string) => void
  selected: number | null
  onSelect: (v: number | null) => void
  loading: boolean
}): React.JSX.Element {
  const lowerFilter = filter.toLowerCase()
  const filtered = prs.filter(
    (pr) =>
      pr.title.toLowerCase().includes(lowerFilter) ||
      pr.headRefName.toLowerCase().includes(lowerFilter) ||
      String(pr.number).includes(filter) ||
      pr.author.toLowerCase().includes(lowerFilter)
  )
  return (
    <label style={modalStyles.label}>
      Pull Request
      <input
        type="text"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder={loading ? 'Loading PRs...' : 'Filter pull requests...'}
        style={modalStyles.input}
      />
      {!loading && (
        <div
          style={{
            marginTop: '4px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: 'var(--bg-input)',
            maxHeight: '192px',
            overflowY: 'auto',
          }}
          role="listbox"
        >
          {filtered.length === 0 && (
            <div style={{ padding: '6px 8px', fontSize: '13px', color: 'var(--text-muted)' }}>
              {filter ? 'No matching pull requests' : 'No open pull requests'}
            </div>
          )}
          {filtered.map((pr) => {
            const isSelected = pr.number === selected
            return (
              <div
                key={pr.number}
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(pr.number)}
                style={{
                  padding: '5px 8px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1px',
                  background: isSelected ? 'var(--accent)' : 'transparent',
                  color: isSelected ? 'var(--accent-text)' : 'var(--text-primary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '11px',
                    color: isSelected ? 'var(--accent-text)' : 'var(--text-muted)',
                    flexShrink: 0,
                  }}>
                    #{pr.number}
                  </span>
                  <span style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {pr.title}
                  </span>
                </div>
                <div style={{
                  fontSize: '11px',
                  color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                  display: 'flex',
                  gap: '8px',
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{pr.headRefName}</span>
                  <span>{pr.author}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </label>
  )
}
