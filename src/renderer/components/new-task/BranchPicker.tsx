import React, { useRef } from 'react'
import type { BranchInfo } from '../../../shared/types'
import { modalStyles } from '../NewTaskModal.styles'

export function BranchPicker({
  branches,
  baseBranch,
  filter,
  onFilterChange,
  selected,
  onSelect,
  loading,
}: {
  branches: BranchInfo[]
  baseBranch: string
  filter: string
  onFilterChange: (v: string) => void
  selected: string
  onSelect: (v: string) => void
  loading: boolean
}): React.JSX.Element {
  const filtered = branches.filter((b) =>
    b.name.toLowerCase().includes(filter.toLowerCase())
  )
  const listRef = useRef<HTMLDivElement>(null)

  return (
    <label style={modalStyles.label}>
      Branch
      <input
        type="text"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder={loading ? 'Loading branches...' : 'Filter branches...'}
        style={modalStyles.input}
      />
      {!loading && (
        <div
          ref={listRef}
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
              {filter ? 'No matching branches' : 'No branches found'}
            </div>
          )}
          {filtered.map((b) => {
            const isBase = b.name === baseBranch
            const isSelected = b.name === selected
            return (
              <div
                key={b.name}
                role="option"
                aria-selected={isSelected}
                onClick={isBase ? undefined : () => onSelect(b.name)}
                style={{
                  padding: '4px 8px',
                  fontSize: '13px',
                  cursor: isBase ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isSelected ? 'var(--accent)' : 'transparent',
                  color: isBase
                    ? 'var(--text-muted)'
                    : isSelected
                      ? 'var(--accent-text)'
                      : 'var(--text-primary)',
                  opacity: isBase ? 0.6 : 1,
                }}
              >
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)' }}>
                  {b.name}
                  {isBase ? ' (default — new tasks branch from here)' : ''}
                </span>
                {b.source !== 'both' && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'inherit',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      fontWeight: 500,
                      background: b.source === 'remote'
                        ? 'rgba(56, 139, 253, 0.15)'
                        : 'rgba(210, 153, 34, 0.15)',
                      color: b.source === 'remote'
                        ? 'rgb(100, 170, 255)'
                        : 'rgb(210, 167, 62)',
                    }}
                  >
                    {b.source}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </label>
  )
}
