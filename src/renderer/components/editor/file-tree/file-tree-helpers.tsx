import React from 'react'
import type { FileTreeNode } from '../../../../shared/types'

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

export function filterTree(node: FileTreeNode, query: string): FileTreeNode | null {
  const lowerQuery = query.toLowerCase()
  function walk(n: FileTreeNode): FileTreeNode | null {
    if (!n.isDirectory) {
      return n.name.toLowerCase().includes(lowerQuery) ? n : null
    }
    const filteredChildren = (n.children ?? [])
      .map(walk)
      .filter((child): child is FileTreeNode => child !== null)
    if (filteredChildren.length > 0) {
      return { ...n, children: filteredChildren }
    }
    return n.name.toLowerCase().includes(lowerQuery) ? { ...n, children: [] } : null
  }
  return walk(node)
}
