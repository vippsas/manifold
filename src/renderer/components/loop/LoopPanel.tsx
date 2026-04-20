import React, { useEffect, useMemo, useState } from 'react'
import { useLoop } from '../../hooks/useLoop'
import { useDockState } from '../editor/dock-panel-types'
import type { LoopConfig, MetricSpec } from '../../../shared/loop-types'
import { loopPanelStyles as S, outcomeColors, stateColors } from './LoopPanel.styles'

interface FormState {
  program: string
  targetGlobs: string
  evalCommand: string
  metricKind: MetricSpec['kind']
  pattern: string
  jsonPath: string
  direction: 'minimize' | 'maximize'
  judgeRubric: string
  judgeMaxScore: string
  budgetSeconds: string
  maxIterations: string
  alwaysAdvance: boolean
  clearContextEachIteration: boolean
}

const DEFAULT_JUDGE_RUBRIC = 'Rate 0-10 based on: 1) does the change actually solve the task? 2) is the diff minimal and focused? 3) any regressions or red flags?'

const DEFAULT_FORM: FormState = {
  program: '',
  targetGlobs: '',
  evalCommand: '',
  metricKind: 'llm-judge',
  pattern: 'ms=(\\d+(?:\\.\\d+)?)',
  jsonPath: 'results.meanMs',
  direction: 'minimize',
  judgeRubric: DEFAULT_JUDGE_RUBRIC,
  judgeMaxScore: '10',
  budgetSeconds: '60',
  maxIterations: '5',
  alwaysAdvance: false,
  clearContextEachIteration: false,
}

function formFromConfig(cfg: LoopConfig | null): FormState {
  if (!cfg) return DEFAULT_FORM
  const m = cfg.metric
  return {
    program: cfg.program,
    targetGlobs: cfg.targetGlobs.join(', '),
    evalCommand: cfg.evalCommand,
    metricKind: m.kind,
    pattern: m.kind === 'stdout-regex' ? m.pattern : DEFAULT_FORM.pattern,
    jsonPath: m.kind === 'json-path' ? m.path : DEFAULT_FORM.jsonPath,
    direction: 'direction' in m ? m.direction : 'minimize',
    judgeRubric: m.kind === 'llm-judge' ? m.rubric : DEFAULT_FORM.judgeRubric,
    judgeMaxScore: m.kind === 'llm-judge' ? String(m.maxScore) : DEFAULT_FORM.judgeMaxScore,
    budgetSeconds: String(cfg.budgetSeconds),
    maxIterations: String(cfg.maxIterations ?? 20),
    alwaysAdvance: cfg.alwaysAdvance ?? false,
    clearContextEachIteration: cfg.clearContextEachIteration ?? false,
  }
}

function configFromForm(sessionId: string, form: FormState): LoopConfig | { error: string } {
  const budget = Number(form.budgetSeconds)
  if (!Number.isFinite(budget) || budget <= 0) return { error: 'budgetSeconds must be positive' }
  const maxIter = Number(form.maxIterations)
  if (!Number.isFinite(maxIter) || maxIter <= 0) return { error: 'maxIterations must be positive' }
  const globs = form.targetGlobs.split(',').map((g) => g.trim()).filter(Boolean)
  if (!form.evalCommand.trim() && form.metricKind !== 'llm-judge') return { error: 'evalCommand cannot be empty' }

  let metric: MetricSpec
  if (form.metricKind === 'stdout-regex') {
    metric = { kind: 'stdout-regex', pattern: form.pattern, direction: form.direction }
  } else if (form.metricKind === 'json-path') {
    metric = { kind: 'json-path', path: form.jsonPath, direction: form.direction }
  } else if (form.metricKind === 'llm-judge') {
    if (!form.judgeRubric.trim()) return { error: 'judge rubric cannot be empty' }
    const maxScore = Number(form.judgeMaxScore)
    if (!Number.isFinite(maxScore) || maxScore <= 0) return { error: 'judge max score must be a positive number' }
    metric = { kind: 'llm-judge', rubric: form.judgeRubric, maxScore, direction: 'maximize' }
  } else {
    metric = { kind: 'exit-code', direction: 'minimize' }
  }

  if (!form.program.trim()) return { error: 'program cannot be empty — describe the task' }

  return {
    sessionId,
    program: form.program,
    targetGlobs: globs,
    evalCommand: form.evalCommand,
    metric,
    budgetSeconds: budget,
    maxIterations: maxIter,
    alwaysAdvance: form.alwaysAdvance,
    clearContextEachIteration: form.clearContextEachIteration,
  }
}

export function LoopPanel(): React.JSX.Element {
  const dock = useDockState()
  const sessionId = dock.sessionId
  const loop = useLoop(sessionId)
  const [restoreMsg, setRestoreMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    if (!restoreMsg) return
    const t = window.setTimeout(() => setRestoreMsg(null), 4000)
    return () => window.clearTimeout(t)
  }, [restoreMsg])

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
  const hasImprovement = !!loop.status?.bestCommitSha && loop.status.bestCommitSha !== loop.status.baselineSha
  const canClear = !isRunning && (loop.iterations.length > 0 || loop.status !== null)

  const handleClear = async (): Promise<void> => {
    if (!window.confirm('Clear all iteration history for this loop? This cannot be undone.')) return
    try {
      await loop.clear()
    } catch (err) {
      setRestoreMsg({ kind: 'err', text: `Clear failed: ${(err as Error).message}` })
    }
  }

  const handleRestoreBest = async (): Promise<void> => {
    setRestoring(true)
    try {
      const { sha } = await loop.restoreBest()
      setRestoreMsg({ kind: 'ok', text: `Restored to ${sha.slice(0, 7)}` })
    } catch (err) {
      setRestoreMsg({ kind: 'err', text: `Restore failed: ${(err as Error).message}` })
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div style={S.wrapper}>
      <div style={S.header}>
        <div style={S.title}>Autoresearch Loop</div>
        <div style={S.headerActions}>
          {restoreMsg && (
            <span
              style={{
                fontSize: 'var(--type-ui-caption)',
                color: restoreMsg.kind === 'ok' ? 'var(--status-done)' : 'var(--status-error)',
              }}
            >
              {restoreMsg.text}
            </span>
          )}
          {isRunning && (
            <button style={S.secondaryButton} onClick={() => void loop.stop()}>Stop</button>
          )}
          {!isRunning && hasImprovement && (
            <button
              style={S.secondaryButton}
              disabled={restoring}
              onClick={() => void handleRestoreBest()}
            >
              {restoring ? 'Restoring…' : 'Restore Best'}
            </button>
          )}
          {canClear && (
            <button style={S.secondaryButton} onClick={() => void handleClear()}>
              Clear
            </button>
          )}
        </div>
      </div>

      {loop.status && (
        <div style={{ ...S.statusBar, ...(isRunning ? S.statusBarRunning : null) }}>
          <div style={{ ...S.stateDot, background: stateColors[loop.status.state] ?? 'var(--text-muted)' }} />
          <div>{loop.status.state}</div>
          <div style={{ color: 'var(--text-muted)' }}>
            iter {loop.status.currentIteration}
          </div>
          {loop.status.bestScore !== undefined && (
            <span style={S.bestBadge}>best {loop.status.bestScore}</span>
          )}
          {isRunning && (
            <span style={S.statusBarShimmer} aria-hidden="true">
              <span style={S.statusBarShimmerFill} />
            </span>
          )}
        </div>
      )}

      <div style={S.content}>
        {!isRunning && <LoopIntro />}
        {!hasConfig || !isRunning ? (
          <LoopConfigForm
            sessionId={sessionId}
            initialConfig={loop.config}
            disabled={isRunning}
            onStart={(cfg) => void loop.start(cfg)}
            onSave={(cfg) => void loop.saveConfig(cfg)}
          />
        ) : null}

        {isRunning && loop.config && loop.status && (
          <PendingIterationCard
            iterationNumber={loop.iterations.length + 1}
            config={loop.config}
          />
        )}

        {loop.iterations.length > 0 && (
          <IterationList iterations={loop.iterations} />
        )}
      </div>
    </div>
  )
}

function LoopIntro(): React.JSX.Element {
  return (
    <details style={S.disclosure}>
      <summary style={S.disclosureSummary}>What is this?</summary>
      <div style={{ ...S.disclosureBody, padding: '0 var(--space-sm) var(--space-sm)' }}>
        <div>
          The loop repeatedly asks the agent to edit your target files, then runs your eval
          command to score the result. Improvements are committed; regressions are discarded
          via <code>git reset --hard</code>. Git is the undo buffer.
        </div>
        <div style={S.introSection}>
          <span style={S.introTag}>Good for</span>
          <span>tasks with an automatable scalar metric — test pass/fail, benchmark timing, bundle size, lint error count. Anywhere you&apos;d otherwise guess-and-check.</span>
        </div>
        <div style={S.introSection}>
          <span style={S.introTagMuted}>Avoid for</span>
          <span>open-ended design work, subjective quality (&ldquo;make the UI nicer&rdquo;), or one-shot changes you already know how to make. If you can&apos;t write an eval command that decides &ldquo;better,&rdquo; don&apos;t loop.</span>
        </div>
      </div>
    </details>
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
  const [aiBusy, setAiBusy] = useState(false)

  React.useEffect(() => { setForm(formFromConfig(initialConfig)) }, [initialConfig])

  async function improveWithAi(): Promise<void> {
    if (aiBusy) return
    setAiBusy(true)
    setError(null)
    try {
      const draft = form.program.trim()
      const instruction = draft
        ? `You are rewriting a task description for an autoresearch loop. The loop repeatedly asks a coding agent to edit files in this repo to improve a measurable metric. Rewrite the user's draft into a clear, concrete task spec: state the goal, list constraints (what not to touch), and define what "better" means. Do NOT ask clarifying questions — make reasonable assumptions and commit to them. Keep it short. Return ONLY the task spec as plain text — no preamble, no code fences, no questions.\n\nUser's draft:\n${draft}`
        : `You are writing a starter task description for an autoresearch loop that runs in this repo. The loop repeatedly asks a coding agent to edit files to improve a measurable metric (eval command: "${form.evalCommand}", target globs: ${form.targetGlobs}). Write a clear, concrete task spec: state a plausible goal based on the repo, list constraints (what not to touch), and define what "better" means. Do NOT ask clarifying questions — make reasonable assumptions and commit to them. Keep it short. Return ONLY the task spec as plain text — no preamble, no code fences, no questions.`
      const improved = await window.electronAPI.invoke('git:ai-generate', sessionId, instruction) as string
      const cleaned = improved.trim()
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

function PendingIterationCard({ iterationNumber, config }: { iterationNumber: number; config: LoopConfig }): React.JSX.Element {
  const maxIter = config.maxIterations ?? '∞'
  return (
    <div style={S.pendingCard}>
      <div style={S.pendingHeader}>
        <span style={S.pendingPulse} aria-hidden="true" />
        <span>Iteration {iterationNumber} of {maxIter} in progress…</span>
      </div>
      <div style={S.pendingProgressTrack} aria-hidden="true">
        <div style={S.pendingProgressBar} />
      </div>
      <div style={S.pendingMeta}>
        <span style={S.pendingMetaLabel}>Eval</span>
        <span style={S.pendingMetaValue}>{config.evalCommand}</span>
        <span style={S.pendingMetaLabel}>Targets</span>
        <span style={S.pendingMetaValue}>{config.targetGlobs.join(', ')}</span>
        <span style={S.pendingMetaLabel}>Metric</span>
        <span style={S.pendingMetaValue}>{describeMetric(config.metric)}</span>
      </div>
      <div style={S.pendingHint}>
        The agent is editing target files, then the eval command will run with a {config.budgetSeconds}s timeout. Result will appear here once scored.
      </div>
    </div>
  )
}

function describeMetric(m: LoopConfig['metric']): string {
  if (m.kind === 'exit-code') return 'exit code (pass = 0)'
  if (m.kind === 'stdout-regex') return `regex /${m.pattern}/ (${m.direction})`
  if (m.kind === 'llm-judge') return `llm judge 0–${m.maxScore} (maximize)`
  return `json ${m.path} (${m.direction})`
}

function IterationList({ iterations }: { iterations: import('../../../shared/loop-types').LoopIteration[] }): React.JSX.Element {
  const sorted = useMemo(
    () => [...iterations].sort((a, b) => {
      const aTime = a.finishedAt ?? a.startedAt
      const bTime = b.finishedAt ?? b.startedAt
      if (bTime !== aTime) return bTime - aTime
      return b.index - a.index
    }),
    [iterations],
  )
  const [expanded, setExpanded] = useState<number | null>(null)
  return (
    <div style={S.iterList}>
      {sorted.map((iter) => {
        const colors = outcomeColors[iter.outcome] ?? outcomeColors.failed
        const canExpand = Boolean(iter.judgeOutputTail?.trim())
        const isOpen = expanded === iter.index
        return (
          <div key={iter.index} style={S.iterGroup}>
            <div
              style={{ ...S.iterRow, ...(canExpand ? S.iterRowClickable : null) }}
              onClick={canExpand ? () => setExpanded(isOpen ? null : iter.index) : undefined}
              role={canExpand ? 'button' : undefined}
              tabIndex={canExpand ? 0 : undefined}
            >
              <div style={S.iterIndex}>#{iter.index}</div>
              <span style={{ ...S.iterOutcome, background: colors.bg, color: colors.fg }}>{iter.outcome}</span>
              {iter.score !== undefined && (
                <span style={S.iterScore}>
                  <span style={S.iterScoreLabel}>score</span>
                  <span style={S.iterScoreValue}>{iter.score}</span>
                </span>
              )}
              <span style={S.iterReason}>{iter.errorMessage ?? (iter.commitSha ? iter.commitSha.slice(0, 7) : '')}</span>
              {canExpand && <span style={S.iterToggle}>{isOpen ? '▾' : '▸'} judge</span>}
            </div>
            {canExpand && isOpen && (
              <pre style={S.iterJudgeOutput}>{iter.judgeOutputTail}</pre>
            )}
          </div>
        )
      })}
    </div>
  )
}
