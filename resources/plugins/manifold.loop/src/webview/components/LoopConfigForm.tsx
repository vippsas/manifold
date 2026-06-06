import React, { useState } from 'react'
import type { LoopConfig, MetricSpec } from '../../types'
import { loopPanelStyles as S } from '../styles'
import { type FormState, configFromForm, formFromConfig } from '../helpers'

interface ConfigFormProps {
  sessionId: string
  initialConfig: LoopConfig | null
  disabled: boolean
  onStart: (config: LoopConfig) => void
  onSave: (config: LoopConfig) => void
  onImproveWithAi: (draft: string, evalCommand: string, targetGlobs: string) => Promise<string>
}

export function LoopConfigForm({ sessionId, initialConfig, disabled, onStart, onSave, onImproveWithAi }: ConfigFormProps): React.JSX.Element {
  const [form, setForm] = useState<FormState>(() => formFromConfig(initialConfig))
  const [error, setError] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)

  React.useEffect(() => { setForm(formFromConfig(initialConfig)) }, [initialConfig])

  async function improveWithAi(): Promise<void> {
    if (aiBusy) return
    setAiBusy(true)
    setError(null)
    try {
      const cleaned = (await onImproveWithAi(form.program.trim(), form.evalCommand, form.targetGlobs)).trim()
      if (!cleaned) {
        setError('AI returned no output — is a default runtime configured?')
        return
      }
      update('program', cleaned)
    } catch (e) {
      setError(`AI improve failed: ${(e as Error).message}`)
    } finally {
      setAiBusy(false)
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function build(): LoopConfig | null {
    const result = configFromForm(sessionId, form)
    if ('error' in result) {
      setError(result.error)
      return null
    }
    setError(null)
    return result
  }

  return (
    <form
      style={S.form}
      onSubmit={(e) => {
        e.preventDefault()
        const cfg = build()
        if (!cfg) return
        onStart(cfg)
      }}
    >
      <div style={S.field}>
        <div style={S.labelRow}>
          <label style={S.label}>Program</label>
          <div style={S.labelActions}>
            <button
              type="button"
              onClick={() => { void improveWithAi() }}
              disabled={disabled || aiBusy}
              style={{
                ...S.aiButton,
                ...(disabled && !aiBusy ? S.aiButtonDisabled : null),
                ...(aiBusy ? S.aiButtonBusy : null),
              }}
              title="Use your default AI coding assistant to rewrite this task spec"
            >
              <span aria-hidden="true" style={{ ...S.aiSparkle, ...(aiBusy ? S.aiSparkleBusy : null) }}>✦</span>
              {aiBusy ? 'Improving…' : 'Improve with AI'}
            </button>
          </div>
        </div>
        <textarea
          style={S.textarea}
          value={form.program}
          onChange={(e) => update('program', e.target.value)}
          disabled={disabled}
          placeholder="Describe what the agent should do each iteration. e.g. 'Make all tests in src/** pass without modifying test files.'"
        />
      </div>

      <div style={S.field}>
        <div style={S.labelRow}>
          <label style={S.label}>Target globs (comma-separated)</label>
          <span style={S.labelHint}>leave blank to allow edits anywhere in the project</span>
        </div>
        <input style={S.input} value={form.targetGlobs} onChange={(e) => update('targetGlobs', e.target.value)} disabled={disabled} placeholder="e.g. src/**, README.md" />
      </div>

      <div style={S.field}>
        <div style={S.labelRow}>
          <label style={S.label}>Eval command</label>
          {form.metricKind === 'llm-judge' && (
            <span style={S.labelHint}>optional — if set, its stdout is passed to the judge</span>
          )}
        </div>
        <input style={S.input} value={form.evalCommand} onChange={(e) => update('evalCommand', e.target.value)} disabled={disabled} placeholder={form.metricKind === 'llm-judge' ? 'leave blank to judge the diff directly' : 'e.g. npm test'} />
      </div>

      <div style={S.inputRow}>
        <div style={{ ...S.field, flex: 1 }}>
          <label style={S.label}>Metric</label>
          <select style={S.select} value={form.metricKind} onChange={(e) => update('metricKind', e.target.value as MetricSpec['kind'])} disabled={disabled}>
            <option value="exit-code">Exit code (pass/fail)</option>
            <option value="stdout-regex">Stdout regex</option>
            <option value="json-path">JSON path</option>
            <option value="llm-judge">LLM as judge (score)</option>
          </select>
        </div>
        {form.metricKind !== 'exit-code' && form.metricKind !== 'llm-judge' && (
          <div style={{ ...S.field, flex: 1 }}>
            <label style={S.label}>Direction</label>
            <select style={S.select} value={form.direction} onChange={(e) => update('direction', e.target.value as 'minimize' | 'maximize')} disabled={disabled}>
              <option value="minimize">Minimize</option>
              <option value="maximize">Maximize</option>
            </select>
          </div>
        )}
        {form.metricKind === 'llm-judge' && (
          <div style={{ ...S.field, flex: 1 }}>
            <label style={S.label}>Max score</label>
            <input style={S.input} value={form.judgeMaxScore} onChange={(e) => update('judgeMaxScore', e.target.value)} disabled={disabled} inputMode="numeric" />
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
      {form.metricKind === 'llm-judge' && (
        <div style={S.field}>
          <div style={S.labelRow}>
            <label style={S.label}>Judge rubric</label>
            <span style={S.labelHint}>0–{form.judgeMaxScore || '10'}, higher is better. Uses the default AI runtime.</span>
          </div>
          <textarea
            style={S.textarea}
            value={form.judgeRubric}
            onChange={(e) => update('judgeRubric', e.target.value)}
            disabled={disabled}
            placeholder="Describe the criteria the judge should apply when scoring each iteration."
          />
        </div>
      )}

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
            <input
              type="checkbox"
              style={S.checkbox}
              checked={form.alwaysAdvance}
              onChange={(e) => update('alwaysAdvance', e.target.checked)}
              disabled={disabled}
            />
            <span style={S.checkboxLabel}>
              <span>Roll forward regardless of score</span>
              <span style={S.checkboxHint}>
                Commit every iteration&apos;s changes even when the score regresses. The best score
                is still tracked, but regressions are no longer reset to the previous commit.
              </span>
            </span>
          </label>

          <label style={S.checkboxRow}>
            <input
              type="checkbox"
              style={S.checkbox}
              checked={form.clearContextEachIteration}
              onChange={(e) => update('clearContextEachIteration', e.target.checked)}
              disabled={disabled}
            />
            <span style={S.checkboxLabel}>
              <span>Clear agent context between iterations</span>
              <span style={S.checkboxHint}>
                Sends <code>/clear</code> before each iteration so the agent starts fresh. Prevents
                context pollution from prior attempts at the cost of losing what was already tried.
                Best for independent attempts; turn off for iterative refinement.
              </span>
            </span>
          </label>
        </div>
      </details>

      {error && <div style={{ color: 'var(--status-error)', fontSize: 'var(--type-ui-small)' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        <button type="submit" style={S.primaryButton} disabled={disabled}>Start Loop</button>
        <button
          type="button"
          style={S.secondaryButton}
          onClick={() => {
            const cfg = build()
            if (!cfg) return
            onSave(cfg)
          }}
          disabled={disabled}
        >Save</button>
      </div>
    </form>
  )
}
