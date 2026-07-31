import React, { useState } from 'react'
import type { AgentRuntime } from '../../../shared/types'
import { runtimePickerStyles } from './AgentRuntimePicker.styles'

/** Two letters at most, and only enough of them to tell the runtimes apart —
 *  "Claude Code" and "Codex" both start with a C. Unlisted runtimes fall back to
 *  their initial; the name under the tile carries the rest. */
const MONOGRAMS: Record<string, string> = {
  claude: 'C',
  codex: 'Cx',
  copilot: 'Co',
  gemini: 'G',
  'ollama-claude': 'C',
  'ollama-codex': 'Cx',
}

function monogram(runtime: AgentRuntime): string {
  return MONOGRAMS[runtime.id] ?? runtime.name.charAt(0).toUpperCase()
}

/** The tiles show what you can actually start, in one row.
 *
 *  Out: a runtime whose binary is missing (a dead tile), and the `needsModel`
 *  variants, which are the same two agents run through Ollama and would double
 *  every monogram — having Ollama installed would otherwise turn four tiles into
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
              <span style={runtimePickerStyles.monogram}>{monogram(runtime)}</span>
              <span style={runtimePickerStyles.name}>{runtime.name}</span>
              {missing && <span style={runtimePickerStyles.missing}>not installed</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
