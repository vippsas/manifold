// resources/plugins/manifold.loop/src/improve-instruction.ts
// Pure prompt builder for "Improve with AI", ported from the loop config form. No manifold import.
export interface ImproveArgs { draft: string; evalCommand: string; targetGlobs: string }

export function buildImproveInstruction({ draft, evalCommand, targetGlobs }: ImproveArgs): string {
  const trimmed = draft.trim()
  return trimmed
    ? `You are rewriting a task description for an autoresearch loop. The loop repeatedly asks a coding agent to edit files in this repo to improve a measurable metric. Rewrite the user's draft into a clear, concrete task spec: state the goal, list constraints (what not to touch), and define what "better" means. Do NOT ask clarifying questions — make reasonable assumptions and commit to them. Keep it short. Return ONLY the task spec as plain text — no preamble, no code fences, no questions.\n\nUser's draft:\n${trimmed}`
    : `You are writing a starter task description for an autoresearch loop that runs in this repo. The loop repeatedly asks a coding agent to edit files to improve a measurable metric (eval command: "${evalCommand}", target globs: ${targetGlobs}). Write a clear, concrete task spec: state a plausible goal based on the repo, list constraints (what not to touch), and define what "better" means. Do NOT ask clarifying questions — make reasonable assumptions and commit to them. Keep it short. Return ONLY the task spec as plain text — no preamble, no code fences, no questions.`
}
