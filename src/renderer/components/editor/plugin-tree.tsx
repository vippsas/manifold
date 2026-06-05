import React, { useEffect, useRef, useState } from 'react'
import type { SerializedTreeItem } from '../../../shared/plugins/tree'

const ICON_MAP: Record<string, string> = {
  folder: '📁',
  file: '📄',
  cloud: '☁️',
  database: '🗄️',
}

function nodeIcon(icon: string | undefined): string {
  if (!icon) return '•'
  return ICON_MAP[icon] ?? '•'
}

interface PluginTreeProps {
  roots: SerializedTreeItem[]
  /** Changing this key collapses all rows and resets the children cache. */
  reloadKey: number
  loadChildren: (parentNodeId: string) => Promise<SerializedTreeItem[]>
  onActivate: (item: SerializedTreeItem) => void
}

interface TreeRowsProps {
  items: SerializedTreeItem[]
  depth: number
  expanded: Set<string>
  pending: Set<string>
  childrenCache: Map<string, SerializedTreeItem[]>
  onToggle: (item: SerializedTreeItem) => void
  onActivate: (item: SerializedTreeItem) => void
}

function TreeRows({ items, depth, expanded, pending, childrenCache, onToggle, onActivate }: TreeRowsProps): React.JSX.Element {
  return (
    <>
      {items.map((item) => {
        const collapsible = item.collapsibleState !== 'none'
        const isExpanded = expanded.has(item.nodeId)
        const isLoading = pending.has(item.nodeId)
        const children = childrenCache.get(item.nodeId) ?? []

        return (
          <React.Fragment key={item.nodeId}>
            <div
              role="treeitem"
              aria-expanded={collapsible ? isExpanded : undefined}
              title={item.tooltip}
              onClick={() => {
                if (collapsible) onToggle(item)
                else onActivate(item)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                paddingLeft: 8 + depth * 16,
                paddingRight: 8,
                paddingTop: 3,
                paddingBottom: 3,
                cursor: 'pointer',
                userSelect: 'none',
                color: 'var(--text-secondary)',
                fontSize: 13,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '' }}
            >
              {collapsible ? (
                <span style={{ fontSize: 10, width: 12, flexShrink: 0, color: 'var(--text-muted)' }}>
                  {isExpanded ? '▼' : '▶'}
                </span>
              ) : (
                <span style={{ width: 12, flexShrink: 0 }} />
              )}
              <span style={{ flexShrink: 0 }}>{nodeIcon(item.icon)}</span>
              <span>{item.label}</span>
              {item.description && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>{item.description}</span>
              )}
            </div>
            {collapsible && isExpanded && (
              isLoading ? (
                <div
                  style={{
                    paddingLeft: 8 + (depth + 1) * 16,
                    paddingTop: 3,
                    paddingBottom: 3,
                    fontSize: 13,
                    color: 'var(--text-muted)',
                  }}
                >
                  Loading…
                </div>
              ) : (
                <TreeRows
                  items={children}
                  depth={depth + 1}
                  expanded={expanded}
                  pending={pending}
                  childrenCache={childrenCache}
                  onToggle={onToggle}
                  onActivate={onActivate}
                />
              )
            )}
          </React.Fragment>
        )
      })}
    </>
  )
}

export function PluginTree({ roots, reloadKey, loadChildren, onActivate }: PluginTreeProps): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [childrenCache, setChildrenCache] = useState<Map<string, SerializedTreeItem[]>>(new Map())
  const prevReloadKeyRef = useRef(reloadKey)

  // Reset expansion and cache when reloadKey changes (tree was refreshed).
  useEffect(() => {
    if (reloadKey !== prevReloadKeyRef.current) {
      prevReloadKeyRef.current = reloadKey
      setExpanded(new Set())
      setPending(new Set())
      setChildrenCache(new Map())
    }
  }, [reloadKey])

  const handleToggle = (item: SerializedTreeItem): void => {
    const nodeId = item.nodeId
    const isExpanded = expanded.has(nodeId)

    if (isExpanded) {
      // Collapse
      setExpanded((prev) => {
        const next = new Set(prev)
        next.delete(nodeId)
        return next
      })
    } else {
      // Expand — if we don't have children yet, load them
      setExpanded((prev) => new Set([...prev, nodeId]))
      if (!childrenCache.has(nodeId)) {
        setPending((prev) => new Set([...prev, nodeId]))
        void loadChildren(nodeId).then((children) => {
          setChildrenCache((prev) => new Map([...prev, [nodeId, children]]))
          setPending((prev) => {
            const next = new Set(prev)
            next.delete(nodeId)
            return next
          })
        })
      }
    }
  }

  return (
    <div
      role="tree"
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        paddingTop: 4,
        paddingBottom: 4,
        boxSizing: 'border-box',
      }}
    >
      <TreeRows
        items={roots}
        depth={0}
        expanded={expanded}
        pending={pending}
        childrenCache={childrenCache}
        onToggle={handleToggle}
        onActivate={onActivate}
      />
    </div>
  )
}
