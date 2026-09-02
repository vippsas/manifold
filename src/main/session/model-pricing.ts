/**
 * Estimated dollar cost for a session's recorded tokens.
 *
 * Claude's transcripts record tokens and a model id, never a price, so cost is
 * derived here from Anthropic's published per-MTok API rates
 * (https://platform.claude.com/docs/en/about-claude/pricing). Two consequences
 * worth stating plainly: the table goes stale whenever those rates change or a
 * model ships, and an unknown model prices as `null` rather than a made-up
 * number. On a subscription plan the result is what the API *would* have
 * charged, not money spent — the UI says so.
 */

/** Tokens for one pricing bucket: a model at one speed, split by how each token is billed. */
export interface CostTokens {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  /** 5-minute cache writes — billed at 1.25x input. */
  cacheWrite5mTokens: number
  /** 1-hour cache writes — billed at 2x input. Claude Code writes these. */
  cacheWrite1hTokens: number
}

export interface CostEstimate {
  /** Estimated USD at public API rates; null when nothing in the session could be priced. */
  usd: number | null
  /** Model ids that carried tokens but are absent from the price table. */
  unpricedModels: string[]
}

/** USD per million tokens. */
interface Rates {
  input: number
  output: number
  cacheRead: number
  cacheWrite5m: number
  cacheWrite1h: number
}

/**
 * Cache rates are multipliers on base input: 1.25x for a 5-minute write, 2x for
 * a 1-hour write, and 0.1x for a read — except Fable 5.1, whose reads are 0.025x.
 */
function rates(input: number, output: number, cacheReadMultiplier = 0.1): Rates {
  return {
    input,
    output,
    cacheRead: input * cacheReadMultiplier,
    cacheWrite5m: input * 1.25,
    cacheWrite1h: input * 2,
  }
}

const OPUS = rates(5, 25)
const FABLE = rates(10, 50)

/** Standard-speed rates, keyed by dateless model id. */
const STANDARD: Record<string, Rates> = {
  'claude-fable-5-1': rates(10, 50, 0.025),
  'claude-fable-5': FABLE,
  'claude-opus-5': OPUS,
  'claude-opus-4-8': OPUS,
  'claude-opus-4-7': OPUS,
  'claude-opus-4-6': OPUS,
  'claude-opus-4-5': OPUS,
  'claude-sonnet-5': rates(2, 10),
  'claude-sonnet-4-6': rates(3, 15),
  'claude-sonnet-4-5': rates(3, 15),
  'claude-haiku-4-5': rates(1, 5),
}

/** Fast mode is a premium tier on the Opus 5 / 4.8 pair only. */
const FAST: Record<string, Rates> = {
  'claude-opus-5': FABLE,
  'claude-opus-4-8': FABLE,
}

const FAST_SUFFIX = '#fast'

/**
 * The price-table key for one turn. Fast mode bills at its own rate, so it needs
 * a bucket of its own even when the model id is identical.
 */
export function rateKey(model: string, speed: string | undefined): string {
  return speed === 'fast' ? `${model}${FAST_SUFFIX}` : model
}

/** Model ids are pinned snapshots; a dated id prices off its dateless form. */
function undated(model: string): string {
  return model.replace(/-\d{8}$/, '')
}

function isEmpty(t: CostTokens): boolean {
  return t.inputTokens === 0 && t.outputTokens === 0 && t.cacheReadTokens === 0 &&
    t.cacheWrite5mTokens === 0 && t.cacheWrite1hTokens === 0
}

function bucketCost(t: CostTokens, r: Rates): number {
  return (
    t.inputTokens * r.input +
    t.outputTokens * r.output +
    t.cacheReadTokens * r.cacheRead +
    t.cacheWrite5mTokens * r.cacheWrite5m +
    t.cacheWrite1hTokens * r.cacheWrite1h
  ) / 1_000_000
}

/** Estimate a session's cost from its per-model, per-speed token buckets. */
export function estimateCostUsd(byRate: Record<string, CostTokens>): CostEstimate {
  const unpriced = new Set<string>()
  let usd = 0
  let priced = false

  for (const [key, t] of Object.entries(byRate)) {
    // A zero-token bucket costs nothing either way, and flagging it as unpriced
    // would surface Claude's `<synthetic>` placeholder entries as a warning.
    if (isEmpty(t)) continue
    const fast = key.endsWith(FAST_SUFFIX)
    const model = fast ? key.slice(0, -FAST_SUFFIX.length) : key
    const r = (fast ? FAST : STANDARD)[undated(model)]
    if (!r) {
      unpriced.add(model)
      continue
    }
    usd += bucketCost(t, r)
    priced = true
  }

  return { usd: priced ? usd : null, unpricedModels: [...unpriced] }
}
