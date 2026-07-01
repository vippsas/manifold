import React from 'react'

export function WorkspaceRootHeader({ name }: { name: string }): React.JSX.Element {
  return (
    <div style={{ padding: '6px 8px 4px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: 'inherit',
          fontWeight: 500,
          color: 'var(--text-secondary)',
        }}
      >
        <span>{name}</span>
      </div>
    </div>
  )
}
