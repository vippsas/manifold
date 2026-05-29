import React, { useCallback, useState } from 'react'
import { titleBarStyles as styles } from './TitleBar.styles'

interface TitleBarProps {
  projectName?: string
  onRename?: (name: string) => void
}

export function TitleBar({ projectName, onRename }: TitleBarProps): React.JSX.Element {
  const editable = Boolean(projectName && onRename)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [hovered, setHovered] = useState(false)

  const startEditing = useCallback((): void => {
    setDraft(projectName ?? '')
    setEditing(true)
  }, [projectName])

  const commit = useCallback((): void => {
    const next = draft.trim()
    if (next && next !== projectName) onRename?.(next)
    setEditing(false)
  }, [draft, projectName, onRename])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setEditing(false)
      }
    },
    [commit]
  )

  return (
    <div style={styles.container}>
      <div style={styles.trafficLightSpacer} />
      <div style={styles.titleArea}>
        {!editable ? (
          <span style={styles.title}>Manifold</span>
        ) : editing ? (
          <input
            ref={(el) => el?.select()}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            style={styles.titleInput}
            aria-label="Project name"
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ ...styles.titleButton, ...(hovered ? styles.titleButtonHover : undefined) }}
            title="Click to rename"
          >
            {projectName}
          </button>
        )}
      </div>
    </div>
  )
}
