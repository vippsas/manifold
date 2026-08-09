import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { tooltipStyles } from './Tooltip.styles'

/**
 * How long the pointer must rest on the trigger before the bubble appears.
 *
 * The native `title` attribute waits roughly a second and then draws in OS
 * chrome — long enough that new users move on before the words they needed ever
 * arrive. A quarter second is short enough to feel like an answer and still long
 * enough that sweeping across a cluster of icons does not strobe.
 */
const OPEN_DELAY_MS = 250

/** Gap between the trigger and the bubble, and the bubble and the viewport edge. */
const OFFSET = 6
const MARGIN = 4

export interface TooltipProps {
  /** What the control does, as a verb phrase: "New worktree", "Remove workspace". */
  label: string
  /** Optional second line: what the action gets you, or what it will not touch. */
  detail?: string
  children: React.ReactNode
}

/**
 * A themed, fast tooltip for controls whose glyph cannot carry their meaning.
 *
 * Shows on hover *and* on keyboard focus, so the words are not mouse-only. The
 * bubble portals to `document.body`: inside the tree it would sit within
 * dockview's `.dv-render-overlay`, whose transform establishes a containing
 * block that offsets `position: fixed` from the viewport coordinates measured
 * here — the same trap `ContextMenu` documents.
 *
 * Triggers must keep their own `aria-label`; the bubble is decorative for
 * assistive tech, which reads the label instead.
 */
export function Tooltip({ label, detail, children }: TooltipProps): React.JSX.Element {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)
  // The trigger's rect at the moment the delay elapsed; null means hidden.
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  const hide = useCallback((): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    setAnchor(null)
  }, [])

  const show = useCallback((): void => {
    if (timer.current !== null) return
    timer.current = window.setTimeout(() => {
      timer.current = null
      const el = wrapRef.current
      if (el) setAnchor(el.getBoundingClientRect())
    }, OPEN_DELAY_MS)
  }, [])

  // A pending timer outlives the component otherwise, and fires setState on a
  // trigger that has already left the tree.
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  useEffect(() => {
    if (!anchor) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') hide()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [anchor, hide])

  // Clamp into the viewport once the bubble has a measured size: it flips above
  // the trigger when there is no room below, which is the common case for the
  // last workspace row in a full-height sidebar.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    if (!bubble || !anchor) return
    const { width, height } = bubble.getBoundingClientRect()
    const below = anchor.bottom + OFFSET
    const fitsBelow = below + height <= window.innerHeight - MARGIN
    bubble.style.left = `${Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - width - MARGIN))}px`
    bubble.style.top = `${fitsBelow ? below : Math.max(MARGIN, anchor.top - height - OFFSET)}px`
    bubble.style.visibility = 'visible'
  }, [anchor])

  return (
    <span
      ref={wrapRef}
      style={tooltipStyles.wrap}
      onPointerEnter={show}
      onPointerLeave={hide}
      // A click has answered the question the tooltip was about to ask, and the
      // control it uncovers (a menu) would open underneath the bubble.
      onPointerDown={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}
      {anchor && createPortal(
        <div ref={bubbleRef} role="tooltip" style={tooltipStyles.bubble}>
          <span style={tooltipStyles.label}>{label}</span>
          {detail && <span style={tooltipStyles.detail}>{detail}</span>}
        </div>,
        document.body,
      )}
    </span>
  )
}
