import React from 'react'
import type { MetricSpec } from '../../types'
import { loopPanelStyles as S } from '../styles'
import type { FormState } from '../helpers'
import { SegmentedControl } from './SegmentedControl'

const METRIC_OPTIONS: ReadonlyArray<{ value: MetricSpec['kind']; label: string }> = [
  { value: 'exit-code', label: 'Exit code' },
  { value: 'stdout-regex', label: 'Stdout regex' },
  { value: 'json-path', label: 'JSON path' },
  { value: 'llm-judge', label: 'LLM judge' },
]

interface Props {
  form: FormState
  disabled: boolean
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void
}

export function ScoringFields({ form, disabled, update }: Props): React.JSX.Element {
  const isJudge = form.metricKind === 'llm-judge'
  const hasDirection = form.metricKind === 'stdout-regex' || form.metricKind === 'json-path'
  return (
    <div style={S.group}>
      <div style={S.field}>
        <label style={S.label}>How is each attempt scored?</label>
        <SegmentedControl
          options={METRIC_OPTIONS}
          value={form.metricKind}
          onChange={(v) => update('metricKind', v)}
          ariaLabel="Scoring metric"
          disabled={disabled}
        />
      </div>

      <div style={S.inputRow}>
        <div style={{ ...S.field, flex: 1 }}>
          <div style={S.labelRow}>
            <label style={S.label}>Eval command</label>
            {isJudge && <span style={S.labelHint}>optional — its stdout is passed to the judge</span>}
          </div>
          <input
            style={S.input}
            value={form.evalCommand}
            onChange={(e) => update('evalCommand', e.target.value)}
            disabled={disabled}
            placeholder={isJudge ? 'leave blank to judge the diff directly' : 'e.g. npm test'}
          />
        </div>
        {isJudge && (
          <div style={{ ...S.field, width: 96, flex: 'none' }}>
            <label style={S.label}>Max score</label>
            <input style={S.input} value={form.judgeMaxScore} onChange={(e) => update('judgeMaxScore', e.target.value)} disabled={disabled} inputMode="numeric" />
          </div>
        )}
        {hasDirection && (
          <div style={{ ...S.field, width: 130, flex: 'none' }}>
            <label style={S.label}>Direction</label>
            <select style={S.select} value={form.direction} onChange={(e) => update('direction', e.target.value as 'minimize' | 'maximize')} disabled={disabled}>
              <option value="minimize">Minimize</option>
              <option value="maximize">Maximize</option>
            </select>
          </div>
        )}
      </div>

      {form.metricKind === 'stdout-regex' && (
        <div style={S.field}>
          <label style={S.label}>Regex (capture group 1 = number)</label>
          <input style={S.input} value={form.pattern} onChange={(e) => update('pattern', e.target.value)} disabled={disabled} />
        </div>
      )}
      {form.metricKind === 'json-path' && (
        <div style={S.field}>
          <label style={S.label}>Dotted JSON path</label>
          <input style={S.input} value={form.jsonPath} onChange={(e) => update('jsonPath', e.target.value)} disabled={disabled} />
        </div>
      )}
      {isJudge && (
        <div style={S.field}>
          <div style={S.labelRow}>
            <label style={S.label}>Judge rubric</label>
            <span style={S.labelHint}>0–{form.judgeMaxScore || '10'}, higher is better. Uses the default AI runtime.</span>
          </div>
          <textarea
            style={S.textareaProse}
            value={form.judgeRubric}
            onChange={(e) => update('judgeRubric', e.target.value)}
            disabled={disabled}
            placeholder="Describe the criteria the judge should apply when scoring each iteration."
          />
        </div>
      )}
    </div>
  )
}
