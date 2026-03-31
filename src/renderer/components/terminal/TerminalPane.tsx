import React, { useCallback, useState } from 'react'
import type { ITheme } from '@xterm/xterm'
import { useTerminal } from '../../hooks/useTerminal'
import { hasAgentPathDragData, readAgentPathDragData } from '../editor/file-tree-drag'

interface TerminalPaneProps {
  sessionId: string | null
  scrollbackLines: number
  terminalFontFamily?: string
  label?: string
  xtermTheme?: ITheme
}

export function TerminalPane({
  sessionId,
  scrollbackLines,
  terminalFontFamily,
  label = 'Terminal',
  xtermTheme,
}: TerminalPaneProps): React.JSX.Element {
  const { containerRef, focusTerminal } = useTerminal({ sessionId, scrollbackLines, terminalFontFamily, xtermTheme })
  const [isDropTarget, setIsDropTarget] = useState(false)

  const clearDropTarget = useCallback((): void => {
    setIsDropTarget(false)
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    if (!sessionId || !hasAgentPathDragData(e.dataTransfer)) return
    e.preventDefault()
    setIsDropTarget(true)
  }, [sessionId])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    if (!sessionId || !hasAgentPathDragData(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDropTarget(true)
  }, [sessionId])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    clearDropTarget()
  }, [clearDropTarget])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    if (!sessionId) return
    const relativePath = readAgentPathDragData(e.dataTransfer)
    clearDropTarget()
    if (!relativePath) return
    e.preventDefault()
    void window.electronAPI.invoke('agent:input', sessionId, relativePath)
    focusTerminal()
  }, [clearDropTarget, focusTerminal, sessionId])

  return (
    <div
      style={paneStyles.wrapper}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div ref={containerRef as React.RefCallback<HTMLDivElement> | React.RefObject<HTMLDivElement> | null} style={paneStyles.container} />
      {isDropTarget && (
        <div style={paneStyles.dropOverlay}>
          <div style={paneStyles.dropLabel}>Drop to insert relative path</div>
        </div>
      )}
    </div>
  )
}

const paneStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
    position: 'relative',
  },
  container: {
    flex: 1,
    overflow: 'hidden',
    padding: '4px',
  },
  dropOverlay: {
    position: 'absolute',
    inset: '8px',
    pointerEvents: 'none',
    borderRadius: '8px',
    border: '1px dashed color-mix(in srgb, var(--accent) 58%, transparent)',
    background: 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--accent) 8%, transparent))',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: '10px',
  },
  dropLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    background: 'color-mix(in srgb, var(--bg-primary) 84%, transparent)',
    border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
    borderRadius: '999px',
    padding: '4px 8px',
  },
}
