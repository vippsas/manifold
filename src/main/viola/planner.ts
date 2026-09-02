import { MAX_TASKS } from './prompts'
import type { ViolaPlan, ViolaReview, ViolaTaskPlan, ViolaWorkerId } from '../../shared/viola'
import { isViolaTaskPurpose, isViolaWorker } from '../../shared/viola'

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
    const purpose = stringValue(raw.purpose) || 'implement'
    if (!isViolaTaskPurpose(purpose)) return { error: `Task "${title}" has an unknown purpose "${purpose}".` }
    let id = slug(title) || `task-${tasks.length + 1}`
    const base = id
    let suffix = 2
    while (used.has(id)) id = `${base}-${suffix++}`
    used.add(id)
    tasks.push({
      id,
      title,
      description,
      acceptance,
      purpose,
      ...(workerValue(raw.worker) ? { worker: workerValue(raw.worker) } : {}),
      gates: purpose === 'implement' ? stringArray(raw.gates) : [],
    })
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

function workerValue(value: unknown): ViolaWorkerId | undefined {
  const worker = stringValue(value)
  return isViolaWorker(worker) ? worker : undefined
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
}
