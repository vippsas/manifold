import React, { useCallback, useRef } from 'react'
import type { AgentSession, AgentSettingsUpdate } from '../shared/types'

/** A rename that touches only the name. Runtime and view mode are echoed back
 *  unchanged, which is what keeps `configureSession` off its restart path — the
 *  agent keeps running and its chat is left alone. Mirrors the settings dialog's
 *  own rule that an orchestrator is always a chat view. */
export function agentNameOnlyUpdate(session: AgentSession, displayName: string): AgentSettingsUpdate {
  return {
    displayName,
    runtimeId: session.runtimeId,
    viewMode: session.runtimeId === 'viola' || session.nonInteractive ? 'chat' : 'terminal',
  }
}

export interface AgentTabNameInputProps {
  initial: string
  /** Called with the trimmed name; never with an empty or unchanged one. */
  onCommit: (name: string) => void
  onDone: () => void
}

/** The tab label as an inline field. Enter saves, Escape cancels, blur saves.
 *
 *  It settles exactly once: saving or cancelling unmounts the input, and a
 *  browser may fire `blur` on the way out, which must not save the draft a
 *  cancel just threw away. Key and pointer events stop here because the tab is
 *  itself a drag handle and a double-click target. */
export function AgentTabNameInput({ initial, onCommit, onDone }: AgentTabNameInputProps): React.JSX.Element {
  const draftRef = useRef(initial)
  const settledRef = useRef(false)

  // Stable identity so the text is selected once, when the input mounts — an
  // inline ref callback would re-run on every render and re-select mid-typing.
  const focusAndSelect = useCallback((el: HTMLInputElement | null): void => {
    el?.focus()
    el?.select()
  }, [])

  const settle = (save: boolean): void => {
    if (settledRef.current) return
    settledRef.current = true
    const next = draftRef.current.trim()
    if (save && next && next !== initial.trim()) onCommit(next)
    onDone()
  }

  return (
    <input
      ref={focusAndSelect}
      className="dock-tab__name-input"
      defaultValue={initial}
      onChange={(e) => { draftRef.current = e.target.value }}
      onBlur={() => settle(true)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); settle(true) }
        else if (e.key === 'Escape') { e.preventDefault(); settle(false) }
      }}
      aria-label="Agent name"
    />
  )
}
