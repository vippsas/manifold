import React from 'react'
import { loopPanelStyles as S } from '../styles'

export interface SegmentOption<T extends string> { value: T; label: string }

interface Props<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  disabled?: boolean
}

/** Accessible segmented pill selector (radiogroup). Replaces a <select> while keeping
 *  keyboard parity: Arrow keys move (and wrap) the selection; click selects. */
export function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel, disabled }: Props<T>): React.JSX.Element {
  function move(delta: number): void {
    if (disabled) return
    const i = options.findIndex((o) => o.value === value)
    const next = options[(i + delta + options.length) % options.length]
    if (next && next.value !== value) onChange(next.value)
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ ...S.segmentGroup, ...(disabled ? S.segmentGroupDisabled : null) }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1) }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
      }}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => { if (!disabled) onChange(o.value) }}
            style={{ ...S.segment, ...(active ? S.segmentActive : null) }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
