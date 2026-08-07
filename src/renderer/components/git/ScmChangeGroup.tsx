import React, { useMemo, useState } from 'react'
import type { FileChange, FileChangeType } from '../../../shared/types'
import { sourceControlStyles as styles } from './SourceControl.styles'
import { ScmIconButton } from './scm-icons'

const TYPE_ORDER: FileChangeType[] = ['modified', 'added', 'deleted']

const CHANGE_INDICATORS: Record<FileChangeType, { color: string; label: string }> = {
  modified: { color: 'var(--warning)', label: 'M' },
  added: { color: 'var(--success)', label: 'A' },
  deleted: { color: 'var(--error)', label: 'D' },
}

/** One of git's two halves of the uncommitted work — VS Code's "Staged Changes"
 *  and "Changes" sections. The group's own actions apply to every file in it;
 *  a row's appear on hover, so a long list stays quiet until you reach for it. */
export function ScmChangeGroup({
  label,
  changes,
  staged,
  onSelectFile,
  onStage,
  onUnstage,
  onDiscard,
}: {
  label: string
  changes: FileChange[]
  /** Which half this is: staged rows can only be unstaged, unstaged rows staged
   *  or discarded. */
  staged: boolean
  onSelectFile: (change: FileChange) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onDiscard: (paths: string[]) => void
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

  const sorted = useMemo(() => (
    [...changes].sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type)
      const bi = TYPE_ORDER.indexOf(b.type)
      if (ai !== bi) return ai - bi
      return a.path.localeCompare(b.path)
    })
  ), [changes])

  const allPaths = sorted.map((c) => c.path)

  return (
    <>
      <div style={styles.groupHeader}>
        <button
          type="button"
          style={styles.groupToggle}
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          <span style={{ ...styles.chevron, transform: collapsed ? 'rotate(-90deg)' : undefined }} aria-hidden>
            ▾
          </span>
          <span style={styles.groupLabel}>{label}</span>
        </button>
        <div style={styles.actionRow}>
          {staged ? (
            <ScmIconButton glyph="unstage" label={`Unstage all ${label}`} onClick={() => onUnstage(allPaths)} />
          ) : (
            <>
              <ScmIconButton glyph="discard" label={`Discard all ${label}`} onClick={() => onDiscard(allPaths)} />
              <ScmIconButton glyph="stage" label={`Stage all ${label}`} onClick={() => onStage(allPaths)} />
            </>
          )}
        </div>
        <span style={styles.groupCount}>{sorted.length}</span>
      </div>
      {!collapsed && sorted.map((change) => (
        <ScmChangeRow
          key={change.path}
          change={change}
          staged={staged}
          onSelect={() => onSelectFile(change)}
          onStage={() => onStage([change.path])}
          onUnstage={() => onUnstage([change.path])}
          onDiscard={() => onDiscard([change.path])}
        />
      ))}
    </>
  )
}

function ScmChangeRow({
  change,
  staged,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
}: {
  change: FileChange
  staged: boolean
  onSelect: () => void
  onStage: () => void
  onUnstage: () => void
  onDiscard: () => void
}): React.JSX.Element {
  const [hover, setHover] = useState(false)
  const parts = change.path.split('/')
  const filename = parts[parts.length - 1]
  const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  const indicator = CHANGE_INDICATORS[change.type]

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button"
      tabIndex={0}
      style={{ ...styles.row, ...(hover ? styles.rowHover : undefined) }}
      title={change.path}
    >
      <span style={styles.rowName}>
        <span style={{ ...styles.indicator, color: indicator.color }}>{indicator.label}</span>
        <span className="truncate" style={styles.filename}>{filename}</span>
        {dir && <span className="truncate" style={styles.dir}>{dir}</span>}
      </span>
      {hover && (
        <div style={styles.actionRow}>
          {staged ? (
            <ScmIconButton glyph="unstage" label={`Unstage ${change.path}`} onClick={onUnstage} />
          ) : (
            <>
              <ScmIconButton glyph="discard" label={`Discard ${change.path}`} onClick={onDiscard} />
              <ScmIconButton glyph="stage" label={`Stage ${change.path}`} onClick={onStage} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
