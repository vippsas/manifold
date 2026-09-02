import type { ViolaRun, ViolaTaskRun } from './types'

const REPORT_MAX_CHARS = 2_000

export function formatPlan(run: ViolaRun): string {
  const tasks = run.tasks.map((task, index) => {
    const acceptance = task.acceptance.map((item) => `   - ${item}`).join('\n')
    const gates = task.gates.length > 0
      ? `\n\n   Gates:\n${task.gates.map((gate) => `   - \`${gate}\``).join('\n')}`
      : ''
    const route = task.purpose === 'explore' ? 'explore, read-only' : task.worker ? `implement on ${task.worker}` : 'implement'
    return `${index + 1}. **${task.title}** · ${route}\n   ${task.description}\n\n   Done when:\n${acceptance}${gates}`
  }).join('\n\n')
  return `## Proposed plan\n\n${run.summary}\n\n${tasks}\n\nNo worker has started. Approve this plan or tell me what to change.`
}

export function formatStart(run: ViolaRun): string {
  const implement = run.tasks.filter((task) => task.purpose === 'implement').length
  const explore = run.tasks.length - implement
  const parts: string[] = []
  if (implement > 0) {
    parts.push(`${implement} implement task${implement === 1 ? '' : 's'} in isolated worktrees, each gated and then reviewed by a different harness`)
  }
  if (explore > 0) parts.push(`${explore} read-only explore task${explore === 1 ? '' : 's'}`)
  return `Starting ${parts.join(' and ')}.`
}

export function formatResult(run: ViolaRun): string {
  const tasks = run.tasks.map((task) => {
    const route = task.reviewRuntimeId
      ? `${task.runtimeId ?? 'unassigned'} → review: ${task.reviewRuntimeId}`
      : task.runtimeId ?? 'unassigned'
    const detail = task.prUrl ? ` · ${task.prUrl}` : task.error ? ` · ${task.error}` : ''
    const report = task.purpose === 'explore' && task.report ? `\n${quote(task.report)}` : ''
    return `- **${task.title}** — ${task.state.replace('_', ' ')} (${route})${detail}${report}`
  }).join('\n')
  return `## Run ${run.state.replace('_', ' ')}\n\n${tasks}\n\nViola did not merge any branch.`
}

/** One chat line per task state change; null for states the plan or summary already cover. */
export function describeTaskProgress(task: ViolaTaskRun): string | null {
  const label = `**${task.title}** ·`
  switch (task.state) {
    case 'planned':
    case 'spawning':
      return null
    case 'implementing':
      return `${label} implementing on ${task.runtimeId}`
    case 'exploring':
      return `${label} exploring on ${task.runtimeId}`
    case 'gating':
      return `${label} running gates`
    case 'reviewing':
      return `${label} reviewing on ${task.reviewRuntimeId}`
    case 'fixing': {
      const blocking = task.review?.blocking.length ?? 0
      return `${label} fixing ${blocking > 0 ? `${blocking} blocking finding${blocking === 1 ? '' : 's'}` : 'a red gate'}`
    }
    case 'done':
      return `${label} done${task.prUrl ? ` · ${task.prUrl}` : ''}`
    case 'needs_attention':
      return `${label} needs attention · ${task.error ?? 'see summary'}`
    case 'error':
      return `${label} failed · ${task.error ?? 'unknown error'}`
  }
}

function quote(text: string): string {
  const bounded = text.length > REPORT_MAX_CHARS ? `${text.slice(0, REPORT_MAX_CHARS)}…` : text
  return bounded.trim().split('\n').map((line) => `  > ${line}`).join('\n')
}
