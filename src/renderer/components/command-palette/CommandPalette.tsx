import React, { useCallback, useMemo, useRef, useState } from 'react'
import { COMMANDS, type CommandDef } from '../../../shared/commands/catalog'
import { formatAccelerator } from '../../../shared/commands/accelerator-label'
import { fuzzyScore } from '../editor/quick-open/fuzzy-match'
import { createDialogStyles } from '../workbench-style-primitives'
import { useAutoFocus } from '../../hooks/useAutoFocus'

const styles = createDialogStyles('560px')

const extra: Record<string, React.CSSProperties> = {
  input: { ...styles.input, width: '100%', boxSizing: 'border-box' },
  list: { maxHeight: '320px', overflowY: 'auto', margin: '0 calc(-1 * var(--space-lg))', borderTop: '1px solid var(--border)' },
  item: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', padding: 'var(--space-sm) var(--space-lg)', cursor: 'pointer' },
  itemActive: { background: 'var(--selection-bg, color-mix(in srgb, var(--accent), transparent 85%))' },
  itemText: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  itemLabel: { fontSize: 'var(--type-ui)', color: 'var(--text-primary)' },
  itemCategory: { fontSize: 'var(--type-ui-caption)', color: 'var(--text-muted)' },
  accel: { fontSize: 'var(--type-ui-small)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' },
  empty: { padding: 'var(--space-lg)', fontSize: 'var(--type-ui-small)', color: 'var(--text-muted)', textAlign: 'center' },
}

interface CommandPaletteProps {
  visible: boolean
  onRun: (id: string) => void
  onClose: () => void
}

export function CommandPalette({ visible, onRun, onClose }: CommandPaletteProps): React.JSX.Element | null {
  const [filter, setFilter] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  useAutoFocus(visible, inputRef)

  const filtered = useMemo<CommandDef[]>(() => {
    const q = filter.trim()
    if (!q) return [...COMMANDS]
    return COMMANDS
      .map((c) => ({ c, score: fuzzyScore(q, `${c.title} ${c.category}`) }))
      .filter((x): x is { c: CommandDef; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c)
  }, [filter])

  const clampedIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1))

  const run = useCallback((command: CommandDef | undefined): void => {
    if (!command) return
    onRun(command.id)
    onClose()
  }, [onRun, onClose])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); run(filtered[clampedIndex]) }
  }, [filtered, clampedIndex, run, onClose])

  if (!visible) return null

  return (
    <div
      ref={overlayRef}
      style={styles.overlay}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.body}>
          <input
            ref={inputRef}
            type="text"
            style={extra.input}
            placeholder="Type a command…"
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setActiveIndex(0) }}
            onKeyDown={onKeyDown}
            aria-label="Filter commands"
            autoComplete="off"
          />
          <div style={extra.list} role="listbox">
            {filtered.length === 0 ? (
              <div style={extra.empty}>No matching commands</div>
            ) : (
              filtered.map((command, idx) => (
                <div
                  key={command.id}
                  role="option"
                  aria-selected={idx === clampedIndex}
                  style={{ ...extra.item, ...(idx === clampedIndex ? extra.itemActive : undefined) }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => run(command)}
                >
                  <span style={extra.itemText}>
                    <span style={extra.itemLabel}>{command.title}</span>
                    <span style={extra.itemCategory}>{command.category}</span>
                  </span>
                  {command.accelerator && <span style={extra.accel}>{formatAccelerator(command.accelerator)}</span>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
