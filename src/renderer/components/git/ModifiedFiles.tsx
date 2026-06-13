import React, { useCallback, useMemo } from 'react'
import type { FileChange, FileChangeType } from '../../../shared/types'
import { getRelativePath } from '../../../shared/relative-path'
import { writeAgentPathDragData } from '../editor/file-tree/file-tree-drag'

interface ModifiedFilesProps {
  changes: FileChange[]
  activeFilePath: string | null
  worktreeRoot: string
  onSelectFile: (absolutePath: string) => void
}

const TYPE_ORDER: FileChangeType[] = ['modified', 'added', 'deleted']

const CHANGE_INDICATORS: Record<FileChangeType, { color: string; label: string }> = {
  modified: { color: 'var(--warning)', label: 'M' },
  added: { color: 'var(--success)', label: 'A' },
  deleted: { color: 'var(--error)', label: 'D' },
}

export function ModifiedFiles({
  changes,
  activeFilePath,
  worktreeRoot,
  onSelectFile,
}: ModifiedFilesProps): React.JSX.Element {
  const root = worktreeRoot.replace(/\/$/, '')

  // Split the worktree's own changes from files inherited because the base
  // branch advanced (another worktree), each sorted independently by type.
  const { own, foreign } = useMemo(() => {
    const byType = (a: FileChange, b: FileChange): number => {
      const ai = TYPE_ORDER.indexOf(a.type)
      const bi = TYPE_ORDER.indexOf(b.type)
      if (ai !== bi) return ai - bi
      return a.path.localeCompare(b.path)
    }
    return {
      own: changes.filter((c) => !c.foreignWorktree).sort(byType),
      foreign: changes.filter((c) => c.foreignWorktree).sort(byType),
    }
  }, [changes])

  const renderRow = (change: FileChange): React.JSX.Element => (
    <ModifiedFileRow
      key={change.path}
      change={change}
      absolutePath={`${root}/${change.path}`}
      relativePath={getRelativePath(`${root}/${change.path}`, root)}
      isActive={activeFilePath === `${root}/${change.path}`}
      onSelect={() => onSelectFile(`${root}/${change.path}`)}
    />
  )

  return (
    <div style={styles.wrapper}>
      <div style={styles.list}>
        {own.length === 0 && foreign.length === 0 ? (
          <div style={styles.empty}>No changes</div>
        ) : (
          <>
            {own.map(renderRow)}
            {foreign.length > 0 && (
              <div style={styles.separator} role="separator">
                <span style={styles.separatorLine} />
                <span style={styles.separatorLabel}>from another worktree</span>
                <span style={styles.separatorLine} />
              </div>
            )}
            {foreign.map(renderRow)}
          </>
        )}
      </div>
    </div>
  )
}

function ModifiedFileRow({
  change,
  absolutePath,
  relativePath,
  isActive,
  onSelect,
}: {
  change: FileChange
  absolutePath: string
  relativePath: string
  isActive: boolean
  onSelect: () => void
}): React.JSX.Element {
  const parts = change.path.split('/')
  const filename = parts[parts.length - 1]
  const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  const indicator = CHANGE_INDICATORS[change.type]
  const foreign = Boolean(change.foreignWorktree)
  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    writeAgentPathDragData(e.dataTransfer, relativePath)
  }, [relativePath])

  return (
    <div
      onClick={onSelect}
      onDragStart={handleDragStart}
      role="button"
      tabIndex={0}
      data-active={isActive || undefined}
      data-path={absolutePath}
      draggable
      style={{
        ...styles.row,
        ...(foreign ? styles.rowForeign : undefined),
        ...(isActive ? styles.rowActive : undefined),
      }}
      title={foreign ? `${change.path} \u2014 changed in another worktree (base advanced)` : change.path}
    >
      <span style={{ ...styles.indicator, color: indicator.color, ...(foreign ? styles.indicatorForeign : undefined) }}>
        {foreign ? '\u25CB' : '\u25CF'}
      </span>
      <div style={styles.fileInfo}>
        <span className="truncate" style={styles.filename}>
          {filename}
        </span>
        {dir && (
          <span className="truncate" style={styles.dir}>
            {dir}
          </span>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  badge: {
    fontSize: '10px',
    color: 'var(--accent)',
    padding: '1px 6px',
    borderRadius: '8px',
    background: 'rgba(79, 195, 247, 0.12)',
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 8px',
    cursor: 'pointer',
    fontSize: '12px',
    lineHeight: '16px',
    color: 'var(--text-primary)',
  },
  rowActive: {
    background: 'rgba(79, 195, 247, 0.12)',
    color: 'var(--accent)',
  },
  rowForeign: {
    color: 'var(--text-muted)',
  },
  separator: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    padding: '6px 8px 2px',
    userSelect: 'none',
  },
  separatorLine: {
    flex: 1,
    height: '1px',
    background: 'var(--divider)',
  },
  separatorLabel: {
    fontSize: 'var(--type-ui-micro)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap' as const,
  },
  indicator: {
    flexShrink: 0,
    fontSize: '8px',
  },
  indicatorForeign: {
    opacity: 0.55,
  },
  fileInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
    flex: 1,
  },
  filename: {
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
  },
  dir: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
}
