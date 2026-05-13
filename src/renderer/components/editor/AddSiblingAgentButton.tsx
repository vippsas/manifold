import React, { useCallback, useEffect, useRef, useState } from 'react'
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
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void window.electronAPI.invoke('runtimes:list').then((list) => {
      setRuntimes((list as AgentRuntime[]).filter((r) => r.installed !== false && !r.needsModel))
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
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
    <div ref={wrapperRef} style={styles.wrapper}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={styles.button}
        aria-label="Add agent on this worktree"
        title="Add agent on this worktree"
      >
        +
      </button>
      {open && (
        <div style={styles.popover} role="menu">
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
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 5,
  },
  button: {
    width: 24,
    height: 24,
    borderRadius: 6,
    background: 'color-mix(in srgb, var(--bg-secondary) 85%, transparent)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popover: {
    position: 'absolute',
    top: 30,
    right: 0,
    minWidth: 180,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
    padding: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
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
