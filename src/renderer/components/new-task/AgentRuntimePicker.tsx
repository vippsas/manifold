import React, { useState } from 'react'
import type { AgentRuntime } from '../../../shared/types'
import { runtimePickerStyles } from './AgentRuntimePicker.styles'
import { RuntimeGlyph, runtimeGlyphPath } from './RuntimeGlyph'

/** The tiles show what you can actually start, in one row.
 *
 *  Out: a runtime whose binary is missing (a dead tile), and the `needsModel`
 *  variants, which are the same two agents run through Ollama and would double
 *  every mark — having Ollama installed would otherwise turn four tiles into
 *  six. Either can still be the current selection, and then it stays visible:
 *  a missing one has to explain why Start is disabled. */
export function visibleRuntimes(runtimes: AgentRuntime[], selectedId: string): AgentRuntime[] {
  const usable = runtimes.filter(
    (rt) => (rt.installed !== false && !rt.needsModel) || rt.id === selectedId,
  )
  return usable.length > 0 ? usable : runtimes
}

export function AgentRuntimePicker({
  value,
  onChange,
  runtimes,
}: {
  value: string
  onChange: (v: string) => void
  runtimes: AgentRuntime[]
}): React.JSX.Element {
  const [hovered, setHovered] = useState<string | null>(null)
  const tiles = visibleRuntimes(runtimes, value)

  return (
    <div style={runtimePickerStyles.wrapper}>
      <span style={runtimePickerStyles.label}>Agent</span>
      <div style={runtimePickerStyles.row} role="radiogroup" aria-label="Agent">
        {tiles.map((runtime) => {
          const selected = runtime.id === value
          const missing = runtime.installed === false
          const glyph = runtimeGlyphPath(runtime.id)
          return (
            <button
              key={runtime.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(runtime.id)}
              onMouseEnter={() => setHovered(runtime.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                ...runtimePickerStyles.tile,
                ...(selected ? runtimePickerStyles.tileSelected : {}),
                ...(!selected && hovered === runtime.id ? runtimePickerStyles.tileHover : {}),
                ...(missing ? runtimePickerStyles.tileMissing : {}),
              }}
            >
              {glyph ? (
                <RuntimeGlyph path={glyph} />
              ) : (
                <span style={runtimePickerStyles.monogram}>{runtime.name.charAt(0).toUpperCase()}</span>
              )}
              <span style={runtimePickerStyles.name}>{runtime.name}</span>
              {missing && <span style={runtimePickerStyles.missing}>not installed</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
