import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PullRequestState } from '../../shared/verdict-types'

const execFileAsync = promisify(execFile)
const EXEC_TIMEOUT_MS = 10000

export interface PullRequestStatus {
  state: PullRequestState
  mergedAt?: string | null
}

interface GhPullRequestView {
  state?: unknown
  mergedAt?: unknown
}

export async function viewPullRequestStatus(prUrl: string): Promise<PullRequestStatus> {
  if (!/^https?:\/\//i.test(prUrl)) {
    throw new Error('PR URL must be http(s)')
  }
  const { stdout } = await execFileAsync(
    'gh',
    ['pr', 'view', prUrl, '--json', 'state,mergedAt'],
    { timeout: EXEC_TIMEOUT_MS },
  )
  return parsePullRequestStatus(stdout)
}

export function parsePullRequestStatus(raw: string): PullRequestStatus {
  const parsed = JSON.parse(raw) as GhPullRequestView
  const mergedAt = typeof parsed.mergedAt === 'string' && parsed.mergedAt.length > 0
    ? parsed.mergedAt
    : null
  if (mergedAt) return { state: 'merged', mergedAt }

  const state = typeof parsed.state === 'string' ? parsed.state.toLowerCase() : ''
  if (state === 'open') return { state: 'open', mergedAt }
  if (state === 'closed') return { state: 'closed', mergedAt }
  if (state === 'merged') return { state: 'merged', mergedAt }
  return { state: 'unknown', mergedAt }
}
