import { DEFAULT_MAX_ITERATIONS, type LoopConfig, type MetricSpec } from '../types'

export interface FormState {
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

export const DEFAULT_FORM: FormState = {
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
  maxIterations: String(DEFAULT_MAX_ITERATIONS),
  alwaysAdvance: false,
  clearContextEachIteration: false,
}

export function formFromConfig(cfg: LoopConfig | null): FormState {
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
    maxIterations: String(cfg.maxIterations ?? DEFAULT_MAX_ITERATIONS),
    alwaysAdvance: cfg.alwaysAdvance ?? false,
    clearContextEachIteration: cfg.clearContextEachIteration ?? false,
  }
}

export function configFromForm(sessionId: string, form: FormState): LoopConfig | { error: string } {
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

export function describeMetric(m: LoopConfig['metric']): string {
  if (m.kind === 'exit-code') return 'exit code (pass = 0)'
  if (m.kind === 'stdout-regex') return `regex /${m.pattern}/ (${m.direction})`
  if (m.kind === 'llm-judge') return `llm judge 0–${m.maxScore} (maximize)`
  return `json ${m.path} (${m.direction})`
}
