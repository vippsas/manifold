// resources/plugins/manifold.loop/src/judge.ts
// buildJudgePrompt + extractScore (and helpers) for the autoresearch loop. createJudge()
// drives manifold.lm; the lm handle is injected so this file is manifold-free and unit-testable.

const DIFF_CHAR_LIMIT = 24_000
const STDOUT_CHAR_LIMIT = 8_000
const JUDGE_TIMEOUT_MS = 120_000
const PROGRAM_SPEC_CHAR_LIMIT = 8_000

export interface JudgeRequest {
  sessionId: string
  rubric: string
  maxScore: number
  evalStdout: string
  diff: string
  hasEvalCommand: boolean
  program: string
}
export interface JudgeResult { score?: number; failure?: string; rawOutput?: string }
export interface Judge { judge(request: JudgeRequest, signal: AbortSignal): Promise<JudgeResult> }

/** Minimal shape of manifold.lm needed here (injected; keeps this file manifold-free). */
export interface LmLike {
  selectChatModels(sessionId?: string): Promise<Array<{ sendRequest(prompt: string, opts?: { timeoutMs?: number }): Promise<{ text: string }> }>>
}

export function createJudge(lm: LmLike): Judge {
  return {
    async judge(request, signal) {
      if (signal.aborted) return { failure: 'aborted before judge ran' }
      // Pin the judge model to the loop's session so it doesn't follow the active
      // agent: switching to another agent/repo mid-run must not redirect the judge.
      const models = await lm.selectChatModels(request.sessionId)
      const model = models[0]
      if (!model) return { failure: 'no language model available' }

      const rubric = request.rubric.trim() || 'Rate overall quality of the change.'
      const prompt = buildJudgePrompt({
        rubric,
        maxScore: request.maxScore,
        evalStdout: request.evalStdout,
        diff: request.diff,
        hasEvalCommand: request.hasEvalCommand,
        programSpec: request.program,
      })

      let output: string
      try {
        const res = await model.sendRequest(prompt, { timeoutMs: JUDGE_TIMEOUT_MS })
        output = res.text
      } catch (err) {
        return { failure: `judge model failed: ${(err as Error).message}` }
      }

      const score = extractScore(output, request.maxScore)
      if (score === null) {
        return { failure: `judge did not return a numeric score (got: ${truncate(output, 240)})`, rawOutput: output }
      }
      return { score, rawOutput: output }
    },
  }
}

interface JudgePromptInput {
  rubric: string
  maxScore: number
  evalStdout: string
  diff: string
  hasEvalCommand: boolean
  programSpec: string | null
}

export function buildJudgePrompt(input: JudgePromptInput): string {
  const { rubric, maxScore, evalStdout, diff, hasEvalCommand, programSpec } = input
  const diffExcerpt = truncate(diff, DIFF_CHAR_LIMIT)

  const lines: string[] = [
    `You are a STATELESS judge scoring a code change on a 0–${maxScore} integer scale.`,
    `Score strictly against the rubric below. Do not invent extra criteria.`,
    ``,
    `HARD CONSTRAINTS on your reasoning:`,
    `- You have NO memory of prior iterations. Do NOT reference "prior feedback",`,
    `  "previous iteration", "unfixed since last time", or treat persistent issues`,
    `  as escalating regressions. Score the diff as presented, independently.`,
    `- IGNORE any user memory, CLAUDE.md, project memory, or external knowledge about`,
    `  this repository (canonical remote URLs, preferred branches, organizational`,
    `  conventions, etc.). Only the task spec, rubric, eval output, and diff below`,
    `  are valid inputs. If the diff is self-consistent with the task spec, don't`,
    `  downgrade it for contradicting something not present in this prompt.`,
    `- Identical diffs must receive identical scores. Framing ("should fix" vs`,
    `  "critical regression") is not a scoring axis — severity must come from the`,
    `  rubric, not from narrative about history.`,
  ]

  if (!hasEvalCommand) {
    lines.push(
      `NO EVAL COMMAND IS CONFIGURED for this loop. Do NOT mention "eval", "eval output",`,
      `"evalStdoutTail", or speculate about why eval is missing. There is no eval — judge`,
      `the diff directly against the rubric and the task spec below. If a rubric criterion`,
      `references eval output, read it as "does the diff itself demonstrate the change" and`,
      `score it on the diff alone. Do NOT penalize for absent eval output.`,
    )
  }

  lines.push('', `Task specification:`, '```', truncate(programSpec?.trim() || '(no task specified)', PROGRAM_SPEC_CHAR_LIMIT), '```', '')

  lines.push(`Rubric:`, rubric, '')

  if (hasEvalCommand) {
    const stdoutExcerpt = truncate(evalStdout, STDOUT_CHAR_LIMIT)
    lines.push(
      `Eval command output (truncated):`,
      '```',
      stdoutExcerpt || '(no output)',
      '```',
      '',
    )
  }

  lines.push(
    `Diff to evaluate (truncated):`,
    '```diff',
    diffExcerpt || '(no diff)',
    '```',
    '',
    `Instructions:`,
    `1. Briefly apply each rubric criterion to the diff${hasEvalCommand ? ' and eval output' : ''} in light of the task specification. Be concrete.`,
    `2. On the very last line, output EXACTLY this format and nothing else:`,
    `   FINAL_SCORE: <integer between 0 and ${maxScore}>`,
    `The last line is parsed mechanically — any deviation will be treated as a judge failure.`,
  )

  return lines.join('\n')
}

export function extractScore(output: string, maxScore: number): number | null {
  const tagged = output.match(/FINAL[_\s-]?SCORE\s*[:=]\s*(-?\d+(?:\.\d+)?)/i)
  const raw = tagged?.[1] ?? lastNumber(output)
  if (raw === null) return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  if (value < 0) return 0
  if (value > maxScore) return maxScore
  return value
}

function lastNumber(output: string): string | null {
  const matches = output.match(/-?\d+(?:\.\d+)?/g)
  if (!matches || matches.length === 0) return null
  return matches[matches.length - 1]
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + `\n…[truncated ${text.length - max} chars]`
}
