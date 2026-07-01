import React from 'react'
import { treeStyles } from './FileTree.styles'

const COLLAPSE_ALL_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5l4-3 4 3"/><path d="M4 11l4-3 4 3"/></svg>'
const EXPAND_ALL_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5l4 3 4-3"/><path d="M4 9.5l4 3 4-3"/></svg>'
const REFRESH_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-15.3-6.4L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.3 6.4L21 16"/><path d="M16 16h5v5"/></svg>'

interface FileTreeToolbarProps {
  onRefresh?: () => Promise<void> | void
  onExpandAll: () => void
  onCollapseAll: () => void
}

/** Refresh / expand-all / collapse-all actions for the file tree. */
export function FileTreeToolbar({
  onRefresh, onExpandAll, onCollapseAll,
}: FileTreeToolbarProps): React.JSX.Element {
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  const handleRefresh = React.useCallback(async (): Promise<void> => {
    if (!onRefresh || isRefreshing) return
    setIsRefreshing(true)
    try {
      await onRefresh()
    } catch (err) {
      console.error('[FileTreeToolbar] failed to refresh file tree:', err)
    } finally {
      setIsRefreshing(false)
    }
  }, [isRefreshing, onRefresh])

  return (
    <div style={treeStyles.filterContainer}>
      {onRefresh && (
        <button
          type="button"
          aria-label="Refresh file tree"
          disabled={isRefreshing}
          style={{ ...treeStyles.toolbarBtn, ...(isRefreshing ? treeStyles.toolbarBtnDisabled : {}) }}
          onClick={() => { void handleRefresh() }}
          title={isRefreshing ? 'Refreshing file tree...' : 'Refresh file tree'}
          dangerouslySetInnerHTML={{ __html: REFRESH_SVG }}
        />
      )}
      <button
        type="button"
        style={treeStyles.toolbarBtn} onClick={onCollapseAll} title="Collapse all folders"
        dangerouslySetInnerHTML={{ __html: COLLAPSE_ALL_SVG }}
      />
      <button
        type="button"
        style={treeStyles.toolbarBtn} onClick={onExpandAll} title="Expand all folders"
        dangerouslySetInnerHTML={{ __html: EXPAND_ALL_SVG }}
      />
    </div>
  )
}
