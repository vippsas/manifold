import React, { useMemo } from 'react'
import type { FileChange, FileChangeType } from '../../../shared/types'

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

  const sorted = useMemo(() => {
    return [...changes].sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type)
      const bi = TYPE_ORDER.indexOf(b.type)
      if (ai !== bi) return ai - bi
      return a.path.localeCompare(b.path)
    })
  }, [changes])

  return (
    <div style={styles.wrapper}>
      <div style={styles.list}>
        {sorted.length === 0 ? (
          <div style={styles.empty}>No changes</div>
        ) : (
          sorted.map((change) => (
            <ModifiedFileRow
              key={change.path}
              change={change}
              isActive={activeFilePath === `${root}/${change.path}`}
              onSelect={() => onSelectFile(`${root}/${change.path}`)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ModifiedFileRow({
  change,
  isActive,
  onSelect,
}: {
  change: FileChange
  isActive: boolean
  onSelect: () => void
}): React.JSX.Element {
  const parts = change.path.split('/')
  const filename = parts[parts.length - 1]
  const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  const indicator = CHANGE_INDICATORS[change.type]

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      data-active={isActive || undefined}
      style={{
        ...styles.row,
        ...(isActive ? styles.rowActive : undefined),
      }}
      title={change.path}
    >
      <span style={{ ...styles.indicator, color: indicator.color }}>{'\u25CF'}</span>
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
  indicator: {
    flexShrink: 0,
    fontSize: '8px',
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
