import React from 'react'
import { treeStyles } from './FileTree.styles'

const COLLAPSE_ALL_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5l4-3 4 3"/><path d="M4 11l4-3 4 3"/></svg>'
const EXPAND_ALL_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5l4 3 4-3"/><path d="M4 9.5l4 3 4-3"/></svg>'

interface FileTreeToolbarProps {
  filterQuery: string
  onFilterChange: (value: string) => void
  onClearFilter: () => void
  onExpandAll: () => void
  onCollapseAll: () => void
}

/** Filter input plus expand-all / collapse-all actions for the file tree. */
export function FileTreeToolbar({
  filterQuery, onFilterChange, onClearFilter, onExpandAll, onCollapseAll,
}: FileTreeToolbarProps): React.JSX.Element {
  return (
    <div style={treeStyles.filterContainer}>
      <input
        type="text" style={treeStyles.filterInput} placeholder="Filter files..."
        value={filterQuery}
        onChange={(e) => onFilterChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onClearFilter() }}
      />
      {filterQuery && (
        <button style={treeStyles.filterClear} onClick={onClearFilter} title="Clear filter">{'×'}</button>
      )}
      <button
        style={treeStyles.toolbarBtn} onClick={onCollapseAll} title="Collapse all folders"
        dangerouslySetInnerHTML={{ __html: COLLAPSE_ALL_SVG }}
      />
      <button
        style={treeStyles.toolbarBtn} onClick={onExpandAll} title="Expand all folders"
        dangerouslySetInnerHTML={{ __html: EXPAND_ALL_SVG }}
      />
    </div>
  )
}
