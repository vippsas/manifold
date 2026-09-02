import type { ViolaTaskPlan, ViolaWorkerId } from '../../shared/viola'

export const MAX_TASKS = 4
/** Diffs above this size are not inlined; the reviewer reads them from its own worktree instead. */
const INLINE_DIFF_LIMIT = 60_000

export function buildPlanPrompt(goal: string, runtimes: ViolaWorkerId[]): string {
  return `You are the planning brain inside Manifold Viola, a coding orchestrator that writes no code itself.

Goal:
${goal}

Available worker harnesses: ${runtimes.join(', ')}.

You may read files in the current repository to ground the plan, but do not edit anything.

Return JSON only with this shape:
{"summary":"one sentence","tasks":[{"title":"short task label","description":"standalone task","acceptance":["verifiable condition"],"purpose":"implement","worker":"${runtimes[0]}","gates":["shell command that must exit 0"]}]}

Rules:
- Return 1-${MAX_TASKS} tasks.
- Workers run in parallel in isolated worktrees. Tasks must not depend on each other or edit the same files.
- Delegate investigation and implementation; Viola itself does not write code.
- "purpose" is "implement" for a repository change, or "explore" for a read-only investigation that answers a question. A goal that only asks a question gets explore tasks and no implement tasks.
- "worker" is optional: name one of the available harnesses when a task clearly suits it, otherwise omit it.
- "gates" lists the exact test, lint, or typecheck commands that prove an implement task, run from the repository root. Prefer the project's real scripts (for example from package.json or a Makefile). Use [] for explore tasks or when no command applies.
- If the goal cannot be split safely, return one task.
- Each description must stand alone.
- Acceptance conditions must be concrete and testable.
- Do not include markdown fences or commentary.`
}

export function buildImplementationPrompt(task: ViolaTaskPlan): string {
  return `IMPLEMENT this scoped task in your current Manifold-managed worktree.

Task: ${task.description}

Acceptance contract:
${bullets(task.acceptance)}
${task.gates.length > 0 ? `\nGates Viola will run from the worktree root before review (each must exit 0):\n${bullets(task.gates)}\n` : ''}
Stay within this task. Add or update tests, run the relevant gates, and inspect the result. Commit the finished change. If GitHub CLI authentication and a remote are available, push the branch and open a pull request. Never merge.

Finish with a short report: what changed (file:line), the exact verification commands you ran with their results, and anything that did not fit the task.`
}

export function buildExplorePrompt(task: ViolaTaskPlan): string {
  return `EXPLORE this question in your current worktree. Edit nothing; this is read-only investigation.

Question: ${task.description}

The answer is complete when:
${bullets(task.acceptance)}

Read only what you need. Finish with a structured report that answers the question with file:line evidence and names anything you could not determine.`
}

export function buildReviewPrompt(
  task: ViolaTaskPlan,
  input: { diff: string; stat: string; report: string },
): string {
  const inline = input.diff.length <= INLINE_DIFF_LIMIT
  const diffSection = inline
    ? `Diff:\n${input.diff}`
    : `The diff is too large to inline. Run \`git diff\` in your worktree to read it in full before judging.`
  return `You are an independent code reviewer. The worker's diff has been applied to your current worktree as uncommitted changes, so you may read surrounding files and run the gates yourself. Do not edit files.

Task: ${task.description}
Acceptance:
${bullets(task.acceptance)}
${task.gates.length > 0 ? `Gates (already green when run by Viola):\n${bullets(task.gates)}\n` : ''}
Implementer's report (unverified claims; check them against the diff):
${input.report.trim() || '(none)'}

Changed files:
${input.stat.trim() || '(no stat available)'}

${diffSection}

Return JSON only:
{"passed":true,"blocking":[],"nonBlocking":[]}

Set passed=false for correctness, security, regression, missing-test, or unmet-acceptance issues. Blocking findings must be concrete and actionable.`
}

export function buildGateFixPrompt(task: ViolaTaskPlan, command: string, output: string): string {
  return `A verification gate failed on your implementation.

Original task: ${task.description}
Acceptance contract:
${bullets(task.acceptance)}

Failing command (run from the worktree root):
${command}

Output:
${output.trim() || '(no output)'}

Make the gate pass without weakening it, rerun it, and update the existing commit or PR. Never merge. Finish with a short report of what you changed.`
}

export function buildFixPrompt(task: ViolaTaskPlan, blocking: string[]): string {
  return `The independent reviewer found blocking issues in your implementation.

Original task: ${task.description}
Acceptance contract:
${bullets(task.acceptance)}

Fix every blocking issue:
${bullets(blocking)}

Keep the fix scoped, rerun the relevant gates, and update the existing commit or PR. Never merge. Finish with a short report of what you changed.`
}

function bullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n')
}
