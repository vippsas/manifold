import React from 'react'
import type { FileTreeNode } from '../../../shared/types'

export function WorkspaceRootHeader({
  name,
  subtitle,
  isAdditional,
}: {
  name: string
  subtitle: string | null
  isAdditional: boolean
}): React.JSX.Element {
  return (
    <div
      style={{
        padding: '6px 8px 4px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          color: 'var(--text-secondary)',
          letterSpacing: '0.05em',
        }}
      >
        <span>{name}</span>
        {isAdditional && (
          <span
            style={{
              fontWeight: 400,
              textTransform: 'lowercase' as const,
              color: 'var(--text-tertiary, rgba(255,255,255,0.35))',
              letterSpacing: 'normal',
            }}
          >
            external
          </span>
        )}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: '10px',
            fontWeight: 400,
            color: 'var(--text-tertiary, rgba(255,255,255,0.35))',
            marginTop: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' as const,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  )
}

export function shortenPath(fullPath: string): string {
  const match = fullPath.match(/^\/(?:Users|home)\/[^/]+/)
  if (match) {
    return '~' + fullPath.slice(match[0].length)
  }
  return fullPath
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
