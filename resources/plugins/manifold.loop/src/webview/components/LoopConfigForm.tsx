import React, { useState } from 'react'
import type { LoopConfig } from '../../types'
import { loopPanelStyles as S } from '../styles'
import { type FormState, configFromForm, formFromConfig } from '../helpers'
import { ScoringFields } from './ScoringFields'
import { AdvancedSection } from './AdvancedSection'

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
      if (!cleaned) { setError('AI returned no output — is a default runtime configured?'); return }
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
    if ('error' in result) { setError(result.error); return null }
    setError(null)
    return result
  }

  function submitStart(): void {
    const cfg = build()
    if (cfg) onStart(cfg)
  }

  return (
    <form
      style={S.form}
      onSubmit={(e) => { e.preventDefault(); submitStart() }}
    >
      <section style={S.group}>
        <div style={S.sectionHeader}>Task</div>
        <div style={S.field}>
          <div style={S.labelRow}>
            <label style={S.label}>What should the agent do each iteration?</label>
            <button
              type="button"
              onClick={() => { void improveWithAi() }}
              disabled={disabled || aiBusy}
              style={{ ...S.aiButton, ...(disabled && !aiBusy ? S.aiButtonDisabled : null), ...(aiBusy ? S.aiButtonBusy : null) }}
              title="Use your default AI coding assistant to rewrite this task spec"
            >
              <span aria-hidden="true" style={{ ...S.aiSparkle, ...(aiBusy ? S.aiSparkleBusy : null) }}>✦</span>
              {aiBusy ? 'Improving…' : 'Improve with AI'}
            </button>
          </div>
          <textarea
            style={S.textareaProse}
            value={form.program}
            onChange={(e) => update('program', e.target.value)}
            disabled={disabled}
            placeholder="Describe what the agent should do each iteration. e.g. 'Make all tests in src/** pass without modifying test files.'"
          />
        </div>
        <div style={S.field}>
          <div style={S.labelRow}>
            <label style={S.label}>Files it may edit</label>
            <span style={S.labelHint}>leave blank to allow edits anywhere</span>
          </div>
          <input style={S.input} value={form.targetGlobs} onChange={(e) => update('targetGlobs', e.target.value)} disabled={disabled} placeholder="e.g. src/**, README.md" />
        </div>
      </section>

      <hr style={S.groupDivider} />

      <section style={S.group}>
        <div style={S.sectionHeader}>Scoring</div>
        <ScoringFields form={form} disabled={disabled} update={update} />
      </section>

      <hr style={S.groupDivider} />

      <AdvancedSection form={form} disabled={disabled} update={update} />

      {error && <div style={{ color: 'var(--status-error)', fontSize: 'var(--type-ui-small)' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        <button type="button" style={S.primaryButton} onClick={submitStart} disabled={disabled}>Start Loop</button>
        <button type="button" style={S.secondaryButton} onClick={() => { const cfg = build(); if (cfg) onSave(cfg) }} disabled={disabled}>Save</button>
      </div>
    </form>
  )
}
