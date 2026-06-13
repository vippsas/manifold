import React from 'react'
import { COMMANDS, COMMAND_CATEGORIES } from '../../../shared/commands/catalog'
import { formatAccelerator } from '../../../shared/commands/accelerator-label'

const styles: Record<string, React.CSSProperties> = {
  group: { marginBottom: 'var(--space-lg)' },
  groupTitle: { fontSize: 'var(--type-ui-caption)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', padding: '4px 0' },
  label: { fontSize: 'var(--type-ui)', color: 'var(--text-primary)' },
  accel: { fontSize: 'var(--type-ui-small)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' },
  palette: { fontSize: 'var(--type-ui-caption)', color: 'var(--text-muted)', whiteSpace: 'nowrap' },
}

/** Read-only list of every command grouped by category, with its keybinding.
 * Shared by the cheat-sheet overlay and the Settings → Shortcuts tab. */
export function ShortcutList(): React.JSX.Element {
  return (
    <div>
      {COMMAND_CATEGORIES.map((category) => {
        const items = COMMANDS.filter((c) => c.category === category)
        if (items.length === 0) return null
        return (
          <div key={category} style={styles.group}>
            <div style={styles.groupTitle}>{category}</div>
            {items.map((command) => (
              <div key={command.id} style={styles.row}>
                <span style={styles.label}>{command.title}</span>
                {command.accelerator
                  ? <span style={styles.accel}>{formatAccelerator(command.accelerator)}</span>
                  : <span style={styles.palette}>Command Palette</span>}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
