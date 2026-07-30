import React from 'react'
import { getSetiFileIcon } from './seti-icons'
import { treeStyles } from './FileTree.styles'

/** File type icon from VS Code's Seti theme — a glyph in the `seti` font, coloured by file type.
 *  Both palettes ride along as custom properties so theme.css can pick the light-theme one.
 *  Shared by the file tree's rows and the editor's file tabs, which name the same file.
 *  Decorative: the name beside it is the label, and the glyph is a private-use
 *  character that would otherwise land in the accessible name. */
export function FileTypeIcon({ name }: { name: string }): React.JSX.Element {
  const icon = getSetiFileIcon(name)
  return (
    <span
      className="file-tree-icon"
      aria-hidden
      style={{
        ...treeStyles.fileIcon,
        '--seti-icon-color': icon.color,
        '--seti-icon-color-light': icon.lightColor,
      } as React.CSSProperties}
    >
      {icon.character}
    </span>
  )
}
