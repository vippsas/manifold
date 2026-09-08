import React, { useCallback } from 'react'
import { sidebarStyles } from './ProjectSidebar.styles'

export interface WorkspaceNameInputProps {
  value: string
  onChange: (next: string) => void
  onCommit: () => void
  onCancel: () => void
}

/** The workspace row's inline rename field.
 *
 *  Every key event stops propagating: the row it sits in is itself a button
 *  that selects the workspace on Enter/Space, so a name containing a space
 *  would otherwise activate the row mid-typing. */
export function WorkspaceNameInput({ value, onChange, onCommit, onCancel }: WorkspaceNameInputProps): React.JSX.Element {
  // Stable identity so React only calls this when the input mounts — an inline
  // ref callback would re-run on every keystroke and re-select the text,
  // making the next character overwrite the whole draft.
  const focusAndSelect = useCallback((el: HTMLInputElement | null): void => {
    el?.focus()
    el?.select()
  }, [])

  return (
    <input
      ref={focusAndSelect}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); onCommit() }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      style={sidebarStyles.nameInput}
      aria-label="Workspace name"
    />
  )
}
