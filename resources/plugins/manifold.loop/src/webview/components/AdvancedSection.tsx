import React from 'react'
import { loopPanelStyles as S } from '../styles'
import type { FormState } from '../helpers'

interface Props {
  form: FormState
  disabled: boolean
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void
}

export function AdvancedSection({ form, disabled, update }: Props): React.JSX.Element {
  return (
    <details style={S.disclosure} open={form.alwaysAdvance}>
      <summary style={S.disclosureSummary}>Advanced</summary>
      <div style={S.disclosureBody}>
        <div style={S.inputRow}>
          <div style={{ ...S.field, flex: 1 }}>
            <label style={S.label}>Budget (seconds)</label>
            <input style={S.input} value={form.budgetSeconds} onChange={(e) => update('budgetSeconds', e.target.value)} disabled={disabled} />
          </div>
          <div style={{ ...S.field, flex: 1 }}>
            <label style={S.label}>Max iterations</label>
            <input style={S.input} value={form.maxIterations} onChange={(e) => update('maxIterations', e.target.value)} disabled={disabled} />
          </div>
        </div>

        <label style={S.checkboxRow}>
          <input type="checkbox" style={S.checkbox} checked={form.alwaysAdvance} onChange={(e) => update('alwaysAdvance', e.target.checked)} disabled={disabled} />
          <span style={S.checkboxLabel}>
            <span>Roll forward regardless of score</span>
            <span style={S.checkboxHint}>
              Commit every iteration&apos;s changes even when the score regresses. The best score is still tracked, but regressions are no longer reset to the previous commit.
            </span>
          </span>
        </label>

        <label style={S.checkboxRow}>
          <input type="checkbox" style={S.checkbox} checked={form.clearContextEachIteration} onChange={(e) => update('clearContextEachIteration', e.target.checked)} disabled={disabled} />
          <span style={S.checkboxLabel}>
            <span>Clear agent context between iterations</span>
            <span style={S.checkboxHint}>
              Sends <code>/clear</code> before each iteration so the agent starts fresh. Prevents context pollution from prior attempts at the cost of losing what was already tried. Best for independent attempts; turn off for iterative refinement.
            </span>
          </span>
        </label>
      </div>
    </details>
  )
}
