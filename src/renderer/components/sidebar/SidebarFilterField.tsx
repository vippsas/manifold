import React, { useCallback } from 'react'
import { SearchGlyph } from './SidebarCardActionGlyphs'
import { filterFieldStyles } from './SidebarFilterField.styles'

export interface SidebarFilterFieldProps {
  value: string
  onChange: (value: string) => void
  /** Escape, or leaving an empty field. The owner unmounts the field. */
  onClose: () => void
}

/** The type-to-narrow field under the Workspaces toolbar. Substring over repo,
 *  workspace and branch names (filterGroups); the tree renders only hits, open. */
export function SidebarFilterField({ value, onChange, onClose }: SidebarFilterFieldProps): React.JSX.Element {
  // Stable, so React calls it once on mount; an inline callback would refocus on
  // every keystroke.
  const focusOnMount = useCallback((el: HTMLInputElement | null): void => { el?.focus() }, [])
  return (
    <div style={filterFieldStyles.field}>
      <SearchGlyph />
      <input
        ref={focusOnMount}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter workspaces"
        aria-label="Filter workspaces"
        style={filterFieldStyles.input}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onClose() }
        }}
        onBlur={() => { if (value.trim() === '') onClose() }}
      />
    </div>
  )
}
