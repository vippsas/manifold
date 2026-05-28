import React from 'react'
import * as styles from './ChatMentionDropdown.styles'

interface Props {
  suggestions: string[]
  activeIndex: number
  onHover: (index: number) => void
  onSelect: (path: string) => void
}

function basename(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? path : path.slice(i + 1)
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

export function ChatMentionDropdown({ suggestions, activeIndex, onHover, onSelect }: Props): React.JSX.Element {
  return (
    <div style={styles.menu} role="listbox" aria-label="File suggestions">
      {suggestions.map((path, index) => {
        const dir = dirname(path)
        return (
          <button
            key={path}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            style={index === activeIndex ? { ...styles.item, ...styles.itemActive } : styles.item}
            onMouseEnter={() => onHover(index)}
            // Use mousedown so selection fires before the textarea blurs.
            onMouseDown={(e) => { e.preventDefault(); onSelect(path) }}
          >
            <span style={styles.name}>{basename(path)}</span>
            {dir && <span style={styles.dir}>{dir}</span>}
          </button>
        )
      })}
    </div>
  )
}
