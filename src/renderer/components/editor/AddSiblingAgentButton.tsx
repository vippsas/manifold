import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AgentRuntime, SpawnAgentOptions } from '../../../shared/types'

interface AddSiblingAgentButtonProps {
  projectId: string | null
  worktreePath: string | null
  noWorktree: boolean
  onLaunch: (options: SpawnAgentOptions) => Promise<unknown>
}

export function AddSiblingAgentButton({
  projectId,
  worktreePath,
  noWorktree,
  onLaunch,
}: AddSiblingAgentButtonProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([])
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void window.electronAPI.invoke('runtimes:list').then((list) => {
      setRuntimes((list as AgentRuntime[]).filter((r) => r.installed !== false && !r.needsModel))
    })
  }, [open])

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setPopoverCoords({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const handlePick = useCallback(
    (runtimeId: string): void => {
      if (!projectId || !worktreePath) return
      setOpen(false)
      void onLaunch({
        projectId,
        runtimeId,
        prompt: '',
        existingWorktreePath: worktreePath,
      })
    },
    [projectId, worktreePath, onLaunch]
  )

  if (!projectId || !worktreePath || noWorktree) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((prev) => !prev) }}
        className="dock-tab__close"
        aria-label="Add agent on this worktree"
        title="Add agent on this worktree"
      >
        +
      </button>
      {open && popoverCoords && createPortal(
        <div
          ref={popoverRef}
          style={{ ...styles.popover, top: popoverCoords.top, right: popoverCoords.right }}
          role="menu"
        >
          <div style={styles.popoverHeader}>Add agent here</div>
          {runtimes.length === 0 ? (
            <div style={styles.empty}>No runtimes available</div>
          ) : (
            runtimes.map((r) => (
              <button
                key={r.id}
                type="button"
                style={styles.runtimeRow}
                onClick={() => handlePick(r.id)}
                role="menuitem"
              >
                {r.name}
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  popover: {
    position: 'fixed',
    minWidth: 180,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
    padding: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    zIndex: 9999,
  },
  popoverHeader: {
    fontSize: 11,
    color: 'var(--text-muted)',
    padding: '6px 8px 4px',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  runtimeRow: {
    appearance: 'none',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    padding: '6px 8px',
    borderRadius: 6,
    fontSize: 13,
    textAlign: 'left',
    cursor: 'pointer',
  },
  empty: {
    fontSize: 12,
    color: 'var(--text-muted)',
    padding: '6px 8px',
  },
}
