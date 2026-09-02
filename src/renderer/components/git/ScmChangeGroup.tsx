import React, { useMemo, useState } from 'react'
import type { FileChange, FileChangeType } from '../../../shared/types'
import type { MenuItem } from '../common/ContextMenu'
import { tidy } from '../common/ContextMenu'
import { sourceControlStyles as styles } from './SourceControl.styles'
import { ScmIconButton } from './scm-icons'
import { buildScmTree, pathsUnder, type ScmTreeNode } from './scm-file-tree'

const TYPE_ORDER: FileChangeType[] = ['modified', 'added', 'deleted']

const CHANGE_INDICATORS: Record<FileChangeType, { color: string; label: string }> = {
  modified: { color: 'var(--warning)', label: 'M' },
  added: { color: 'var(--success)', label: 'A' },
  deleted: { color: 'var(--error)', label: 'D' },
}

/** Which of git's three buckets a group shows. `staged` rows can only be
 *  unstaged; the other two can be staged or discarded — but discarding an
 *  untracked file deletes it, which the confirm dialog spells out. */
export type ScmGroupKind = 'staged' | 'unstaged' | 'untracked'

export type ScmViewMode = 'list' | 'tree'

/** Open the panel's shared context menu at the pointer with these items. */
export type OpenScmMenu = (event: React.MouseEvent, items: MenuItem[]) => void

/** One of git's buckets of uncommitted work — VS Code's "Staged Changes",
 *  "Changes", and "Untracked Changes" sections. The group's own actions apply
 *  to every file in it; a row's appear on hover, so a long list stays quiet
 *  until you reach for it. Every action is also on the right-click menu, which
 *  is the only place the less-used ones (view mode, whole-directory staging)
 *  live. */
export function ScmChangeGroup({
  label,
  changes,
  kind,
  viewMode,
  onSelectFile,
  onStage,
  onUnstage,
  onDiscard,
  onOpenMenu,
  onSetViewMode,
}: {
  label: string
  changes: FileChange[]
  kind: ScmGroupKind
  viewMode: ScmViewMode
  onSelectFile: (change: FileChange) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onDiscard: (paths: string[], kind: ScmGroupKind) => void
  onOpenMenu: OpenScmMenu
  onSetViewMode: (mode: ScmViewMode) => void
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const isStaged = kind === 'staged'

  const sorted = useMemo(() => (
    [...changes].sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type)
      const bi = TYPE_ORDER.indexOf(b.type)
      if (ai !== bi) return ai - bi
      return a.path.localeCompare(b.path)
    })
  ), [changes])

  const tree = useMemo(() => buildScmTree(changes), [changes])
  const allPaths = sorted.map((c) => c.path)

  /** The stage/unstage/discard entries for a set of paths, shared by the group
   *  header, a directory row, and a file row so all three offer the same verbs. */
  const actionItems = (paths: string[], scope: string): MenuItem[] => (
    isStaged
      ? [{ label: `Unstage ${scope}`, action: () => onUnstage(paths) }]
      : [
          { label: `Stage ${scope}`, action: () => onStage(paths) },
          { label: kind === 'untracked' ? `Delete ${scope}` : `Discard ${scope}`, action: () => onDiscard(paths, kind) },
        ]
  )

  const viewModeItems: MenuItem[] = [
    { label: 'View as List', action: () => onSetViewMode('list'), disabled: viewMode === 'list' },
    { label: 'View as Tree', action: () => onSetViewMode('tree'), disabled: viewMode === 'tree' },
  ]

  const groupMenu = (): MenuItem[] => tidy([
    ...actionItems(allPaths, 'All Changes'),
    'separator',
    ...viewModeItems,
  ])

  const rowProps = {
    kind,
    viewMode,
    onSelectFile,
    onStage,
    onUnstage,
    onDiscard,
    onOpenMenu,
    actionItems,
    viewModeItems,
  }

  return (
    <>
      <div style={styles.groupHeader} onContextMenu={(e) => onOpenMenu(e, groupMenu())}>
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
          {isStaged ? (
            <ScmIconButton glyph="unstage" label={`Unstage all ${label}`} onClick={() => onUnstage(allPaths)} />
          ) : (
            <>
              <ScmIconButton glyph="discard" label={`Discard all ${label}`} onClick={() => onDiscard(allPaths, kind)} />
              <ScmIconButton glyph="stage" label={`Stage all ${label}`} onClick={() => onStage(allPaths)} />
            </>
          )}
        </div>
        <span style={styles.groupCount}>{sorted.length}</span>
      </div>
      {!collapsed && viewMode === 'list' && sorted.map((change) => (
        <ScmChangeRow key={change.path} change={change} depth={0} {...rowProps} />
      ))}
      {!collapsed && viewMode === 'tree' && tree.map((node) => (
        <ScmTreeNodeRow key={node.kind === 'dir' ? `dir:${node.path}` : node.change.path} node={node} depth={0} {...rowProps} />
      ))}
    </>
  )
}

/** Shared by the file and directory rows: everything a row needs to act on
 *  itself without threading each callback through the tree recursion. */
interface RowContext {
  kind: ScmGroupKind
  viewMode: ScmViewMode
  onSelectFile: (change: FileChange) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onDiscard: (paths: string[], kind: ScmGroupKind) => void
  onOpenMenu: OpenScmMenu
  actionItems: (paths: string[], scope: string) => MenuItem[]
  viewModeItems: MenuItem[]
}

function indent(depth: number): React.CSSProperties {
  // The list-mode row's own 28px left padding is the depth-0 baseline, so a
  // flat tree lines up exactly with the flat list it toggles from.
  return depth === 0 ? {} : { paddingLeft: `${28 + depth * 12}px` }
}

function ScmTreeNodeRow({ node, depth, ...ctx }: { node: ScmTreeNode; depth: number } & RowContext): React.JSX.Element {
  if (node.kind === 'file') {
    return <ScmChangeRow change={node.change} depth={depth} {...ctx} />
  }
  return <ScmDirRow node={node} depth={depth} {...ctx} />
}

function ScmDirRow({ node, depth, ...ctx }: { node: Extract<ScmTreeNode, { kind: 'dir' }>; depth: number } & RowContext): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const [hover, setHover] = useState(false)
  const paths = useMemo(() => pathsUnder(node), [node])
  const isStaged = ctx.kind === 'staged'

  const menu = (): MenuItem[] => tidy([
    ...ctx.actionItems(paths, `${paths.length} File${paths.length === 1 ? '' : 's'}`),
    'separator',
    ...ctx.viewModeItems,
  ])

  return (
    <>
      <div
        onClick={() => setCollapsed((c) => !c)}
        onContextMenu={(e) => ctx.onOpenMenu(e, menu())}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-label={node.path}
        style={{ ...styles.row, ...indent(depth), ...(hover ? styles.rowHover : undefined) }}
      >
        <span style={styles.rowName}>
          <span style={{ ...styles.chevron, transform: collapsed ? 'rotate(-90deg)' : undefined }} aria-hidden>
            ▾
          </span>
          <span className="truncate" style={styles.dirName}>{node.label}</span>
        </span>
        {hover && (
          <div style={styles.actionRow}>
            {isStaged ? (
              <ScmIconButton glyph="unstage" label={`Unstage ${node.path}`} onClick={() => ctx.onUnstage(paths)} />
            ) : (
              <>
                <ScmIconButton glyph="discard" label={`Discard ${node.path}`} onClick={() => ctx.onDiscard(paths, ctx.kind)} />
                <ScmIconButton glyph="stage" label={`Stage ${node.path}`} onClick={() => ctx.onStage(paths)} />
              </>
            )}
          </div>
        )}
      </div>
      {!collapsed && node.children.map((child) => (
        <ScmTreeNodeRow
          key={child.kind === 'dir' ? `dir:${child.path}` : child.change.path}
          node={child}
          depth={depth + 1}
          {...ctx}
        />
      ))}
    </>
  )
}

function ScmChangeRow({
  change,
  depth,
  kind,
  viewMode,
  onSelectFile,
  onStage,
  onUnstage,
  onDiscard,
  onOpenMenu,
  actionItems,
  viewModeItems,
}: { change: FileChange; depth: number } & RowContext): React.JSX.Element {
  const [hover, setHover] = useState(false)
  const parts = change.path.split('/')
  const filename = parts[parts.length - 1]
  // The tree already spells the directory out on its own rows, so repeating it
  // beside every filename would just be noise.
  const dir = viewMode === 'tree' || parts.length === 1 ? '' : parts.slice(0, -1).join('/')
  const indicator = CHANGE_INDICATORS[change.type]
  const isStaged = kind === 'staged'

  const menu = (): MenuItem[] => tidy([
    { label: 'Open Changes', action: () => onSelectFile(change) },
    'separator',
    ...actionItems([change.path], 'Changes'),
    'separator',
    ...viewModeItems,
  ])

  return (
    <div
      onClick={() => onSelectFile(change)}
      onContextMenu={(e) => onOpenMenu(e, menu())}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button"
      tabIndex={0}
      style={{ ...styles.row, ...indent(depth), ...(hover ? styles.rowHover : undefined) }}
      title={change.path}
    >
      <span style={styles.rowName}>
        <span style={{ ...styles.indicator, color: indicator.color }}>{indicator.label}</span>
        <span className="truncate" style={styles.filename}>{filename}</span>
        {dir && <span className="truncate" style={styles.dir}>{dir}</span>}
      </span>
      {hover && (
        <div style={styles.actionRow}>
          {isStaged ? (
            <ScmIconButton glyph="unstage" label={`Unstage ${change.path}`} onClick={() => onUnstage([change.path])} />
          ) : (
            <>
              <ScmIconButton glyph="discard" label={`Discard ${change.path}`} onClick={() => onDiscard([change.path], kind)} />
              <ScmIconButton glyph="stage" label={`Stage ${change.path}`} onClick={() => onStage([change.path])} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
