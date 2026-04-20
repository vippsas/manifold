import React, { useMemo, useState } from 'react'
import { useLoop } from '../../hooks/useLoop'
import { useDockState } from '../editor/dock-panel-types'
import type { LoopConfig, MetricSpec } from '../../../shared/loop-types'
import { loopPanelStyles as S, outcomeColors, stateColors } from './LoopPanel.styles'

interface FormState {
  programFile: string
  targetGlobs: string
  evalCommand: string
  metricKind: MetricSpec['kind']
  pattern: string
  jsonPath: string
  direction: 'minimize' | 'maximize'
  budgetSeconds: string
  maxIterations: string
}

const DEFAULT_FORM: FormState = {
  programFile: 'program.md',
  targetGlobs: 'src/**',
  evalCommand: 'npm test',
  metricKind: 'exit-code',
  pattern: 'ms=(\\d+(?:\\.\\d+)?)',
  jsonPath: 'results.meanMs',
  direction: 'minimize',
  budgetSeconds: '60',
  maxIterations: '20',
}

function formFromConfig(cfg: LoopConfig | null): FormState {
  if (!cfg) return DEFAULT_FORM
  const m = cfg.metric
  return {
    programFile: cfg.programFile,
    targetGlobs: cfg.targetGlobs.join(', '),
    evalCommand: cfg.evalCommand,
    metricKind: m.kind,
    pattern: m.kind === 'stdout-regex' ? m.pattern : DEFAULT_FORM.pattern,
    jsonPath: m.kind === 'json-path' ? m.path : DEFAULT_FORM.jsonPath,
    direction: 'direction' in m ? m.direction : 'minimize',
    budgetSeconds: String(cfg.budgetSeconds),
    maxIterations: String(cfg.maxIterations ?? 20),
  }
}

function configFromForm(sessionId: string, form: FormState): LoopConfig | { error: string } {
  const budget = Number(form.budgetSeconds)
  if (!Number.isFinite(budget) || budget <= 0) return { error: 'budgetSeconds must be positive' }
  const maxIter = Number(form.maxIterations)
  if (!Number.isFinite(maxIter) || maxIter <= 0) return { error: 'maxIterations must be positive' }
  const globs = form.targetGlobs.split(',').map((g) => g.trim()).filter(Boolean)
  if (globs.length === 0) return { error: 'targetGlobs cannot be empty' }
  if (!form.evalCommand.trim()) return { error: 'evalCommand cannot be empty' }

  let metric: MetricSpec
  if (form.metricKind === 'stdout-regex') {
    metric = { kind: 'stdout-regex', pattern: form.pattern, direction: form.direction }
  } else if (form.metricKind === 'json-path') {
    metric = { kind: 'json-path', path: form.jsonPath, direction: form.direction }
  } else {
    metric = { kind: 'exit-code', direction: 'minimize' }
  }

  return {
    sessionId,
    programFile: form.programFile,
    targetGlobs: globs,
    evalCommand: form.evalCommand,
    metric,
    budgetSeconds: budget,
    maxIterations: maxIter,
  }
}

export function LoopPanel(): React.JSX.Element {
  const dock = useDockState()
  const sessionId = dock.sessionId
  const loop = useLoop(sessionId)

  if (!sessionId) {
    return (
      <div style={S.wrapper}>
        <div style={S.empty}>
          <div>Select a session to configure an autoresearch loop.</div>
          <div style={{ color: 'var(--text-muted)' }}>
            The loop repeatedly asks the agent to edit files, then runs an eval command
            to decide whether each attempt is an improvement.
          </div>
        </div>
      </div>
    )
  }

  const isRunning = loop.status?.state === 'running'
  const hasConfig = loop.config !== null

  return (
    <div style={S.wrapper}>
      <div style={S.header}>
        <div style={S.title}>Autoresearch Loop</div>
        <div style={S.headerActions}>
          {isRunning && (
            <button style={S.secondaryButton} onClick={() => void loop.stop()}>Stop</button>
          )}
          {!isRunning && loop.status?.bestCommitSha && (
            <button style={S.secondaryButton} onClick={() => void loop.restoreBest()}>Restore Best</button>
          )}
        </div>
      </div>

      {loop.status && (
        <div style={S.statusBar}>
          <div style={{ ...S.stateDot, background: stateColors[loop.status.state] ?? 'var(--text-muted)' }} />
          <div>{loop.status.state}</div>
          <div style={{ color: 'var(--text-muted)' }}>
            iter {loop.status.currentIteration}
          </div>
          {loop.status.bestScore !== undefined && (
            <span style={S.bestBadge}>best {loop.status.bestScore}</span>
          )}
        </div>
      )}

      <div style={S.content}>
        {!hasConfig || !isRunning ? (
          <LoopConfigForm
            sessionId={sessionId}
            initialConfig={loop.config}
            disabled={isRunning}
            onStart={(cfg) => void loop.start(cfg)}
            onSave={(cfg) => void loop.saveConfig(cfg)}
          />
        ) : null}

        {loop.iterations.length > 0 && (
          <IterationList iterations={loop.iterations} />
        )}
      </div>
    </div>
  )
}

interface ConfigFormProps {
  sessionId: string
  initialConfig: LoopConfig | null
  disabled: boolean
  onStart: (config: LoopConfig) => void
  onSave: (config: LoopConfig) => void
}

function LoopConfigForm({ sessionId, initialConfig, disabled, onStart, onSave }: ConfigFormProps): React.JSX.Element {
  const [form, setForm] = useState<FormState>(() => formFromConfig(initialConfig))
  const [error, setError] = useState<string | null>(null)

  React.useEffect(() => { setForm(formFromConfig(initialConfig)) }, [initialConfig])

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
    <form style={S.form} onSubmit={(e) => { e.preventDefault(); const cfg = build(); if (cfg) onStart(cfg) }}>
      <div style={S.field}>
        <label style={S.label}>Program file</label>
        <input style={S.input} value={form.programFile} onChange={(e) => update('programFile', e.target.value)} disabled={disabled} />
      </div>

      <div style={S.field}>
        <label style={S.label}>Target globs (comma-separated)</label>
        <input style={S.input} value={form.targetGlobs} onChange={(e) => update('targetGlobs', e.target.value)} disabled={disabled} />
      </div>

      <div style={S.field}>
        <label style={S.label}>Eval command</label>
        <input style={S.input} value={form.evalCommand} onChange={(e) => update('evalCommand', e.target.value)} disabled={disabled} />
      </div>

      <div style={S.inputRow}>
        <div style={{ ...S.field, flex: 1 }}>
          <label style={S.label}>Metric</label>
          <select style={S.select} value={form.metricKind} onChange={(e) => update('metricKind', e.target.value as MetricSpec['kind'])} disabled={disabled}>
            <option value="exit-code">Exit code (pass/fail)</option>
            <option value="stdout-regex">Stdout regex</option>
            <option value="json-path">JSON path</option>
          </select>
        </div>
        {form.metricKind !== 'exit-code' && (
          <div style={{ ...S.field, flex: 1 }}>
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

      {error && <div style={{ color: 'var(--status-error)', fontSize: 'var(--type-ui-small)' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        <button type="submit" style={S.primaryButton} disabled={disabled}>Start Loop</button>
        <button type="button" style={S.secondaryButton} onClick={() => { const cfg = build(); if (cfg) onSave(cfg) }} disabled={disabled}>Save</button>
      </div>
    </form>
  )
}

function IterationList({ iterations }: { iterations: import('../../../shared/loop-types').LoopIteration[] }): React.JSX.Element {
  const sorted = useMemo(() => [...iterations].sort((a, b) => b.index - a.index), [iterations])
  return (
    <div style={S.iterList}>
      {sorted.map((iter) => {
        const colors = outcomeColors[iter.outcome] ?? outcomeColors.failed
        return (
          <div key={iter.index} style={S.iterRow}>
            <div style={S.iterIndex}>#{iter.index}</div>
            <span style={{ ...S.iterOutcome, background: colors.bg, color: colors.fg }}>{iter.outcome}</span>
            {iter.score !== undefined && <span style={S.iterScore}>{iter.score}</span>}
            <span style={S.iterReason}>{iter.errorMessage ?? (iter.commitSha ? iter.commitSha.slice(0, 7) : '')}</span>
          </div>
        )
      })}
    </div>
  )
}
