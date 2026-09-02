import type { ViolaPlan, ViolaReview, ViolaTaskPlan, ViolaWorkerId } from './types'

const MAX_TASKS = 4

export function buildPlanPrompt(goal: string, runtimes: ViolaWorkerId[]): string {
  return `You are the planning brain inside Manifold Viola, a coding orchestrator that writes no code itself.

Goal:
${goal}

Available worker harnesses: ${runtimes.join(', ')}.

Return JSON only with this shape:
{"summary":"one sentence","tasks":[{"title":"short task label","description":"standalone implementation task","acceptance":["verifiable condition"]}]}

Rules:
- Return 1-${MAX_TASKS} tasks.
- Workers run in parallel in isolated worktrees. Tasks must not depend on each other or edit the same files.
- Delegate investigation and implementation; Viola itself does not write code.
- If the goal cannot be split safely, return one task.
- Each description must stand alone.
- Acceptance conditions must be concrete and testable.
- Do not include markdown fences or commentary.`
}

export function buildReviewPrompt(task: ViolaTaskPlan, diff: string): string {
  const boundedDiff = diff.length > 80_000
    ? `${diff.slice(0, 80_000)}\n\n[diff truncated by Viola]`
    : diff
  return `You are an independent code reviewer. Review only the supplied diff against the task contract. Do not edit files.

Task: ${task.description}
Acceptance:
${task.acceptance.map((item) => `- ${item}`).join('\n')}

Diff:
${boundedDiff}

Return JSON only:
{"passed":true,"blocking":[],"nonBlocking":[]}

Set passed=false for correctness, security, regression, missing-test, or unmet-acceptance issues. Blocking findings must be concrete and actionable.`
}

export function buildImplementationPrompt(task: ViolaTaskPlan): string {
  return `IMPLEMENT this scoped task in your current Manifold-managed worktree.

Task: ${task.description}

Acceptance contract:
${task.acceptance.map((item) => `- ${item}`).join('\n')}

Stay within this task. Add or update tests, run the relevant gates, and inspect the result. Commit the finished change. If GitHub CLI authentication and a remote are available, push the branch and open a pull request. Never merge. Report what changed and the exact verification commands.`
}

export function buildFixPrompt(task: ViolaTaskPlan, blocking: string[]): string {
  return `The independent reviewer found blocking issues in your implementation.

Original task: ${task.description}
Acceptance contract:
${task.acceptance.map((item) => `- ${item}`).join('\n')}

Fix every blocking issue:
${blocking.map((item) => `- ${item}`).join('\n')}

Keep the fix scoped, rerun the relevant gates, and update the existing commit or PR. Never merge.`
}

export function parsePlanResponse(text: string): ViolaPlan | { error: string } {
  const parsed = parseJsonObject(text)
  if (!parsed) return { error: 'The planning brain did not return valid JSON.' }
  const summary = stringValue(parsed.summary)
  const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : []
  if (rawTasks.length === 0) return { error: 'The plan has no tasks.' }
  if (rawTasks.length > MAX_TASKS) return { error: `The plan has ${rawTasks.length} tasks; Viola allows at most ${MAX_TASKS}.` }

  const used = new Set<string>()
  const tasks: ViolaTaskPlan[] = []
  for (const raw of rawTasks) {
    if (!isRecord(raw)) return { error: 'Every plan task must be an object.' }
    const title = stringValue(raw.title)
    const description = stringValue(raw.description)
    const acceptance = stringArray(raw.acceptance)
    if (!title || !description || acceptance.length === 0) {
      return { error: 'Every task needs a title, description, and at least one acceptance condition.' }
    }
    let id = slug(title) || `task-${tasks.length + 1}`
    const base = id
    let suffix = 2
    while (used.has(id)) id = `${base}-${suffix++}`
    used.add(id)
    tasks.push({ id, title, description, acceptance })
  }
  return { summary: summary || `${tasks.length} scoped task${tasks.length === 1 ? '' : 's'}`, tasks }
}

export function parseReviewResponse(text: string): ViolaReview | { error: string } {
  const parsed = parseJsonObject(text)
  if (!parsed || typeof parsed.passed !== 'boolean') {
    return { error: 'The reviewer did not return a structured verdict.' }
  }
  const blocking = stringArray(parsed.blocking)
  const nonBlocking = stringArray(parsed.nonBlocking)
  return { passed: parsed.passed && blocking.length === 0, blocking, nonBlocking }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value: unknown = JSON.parse(trimmed.slice(start, end + 1))
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : []
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
}
