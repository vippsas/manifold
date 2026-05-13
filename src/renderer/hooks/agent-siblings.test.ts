import { describe, expect, it } from 'vitest'
import type { AgentSession } from '../../shared/types'
import {
  dedupeSessionsByWorktree,
  getExtraSiblings,
  getPrimarySession,
  getSiblingSessions,
  isSiblingPanelId,
  parseSiblingSessionId,
  siblingPanelId,
} from './agent-siblings'

function makeSession(id: string, worktreePath: string): AgentSession {
  return {
    id,
    projectId: 'p',
    runtimeId: 'claude',
    branchName: `manifold/${id}`,
    worktreePath,
    status: 'running',
    pid: 1,
    additionalDirs: [],
  }
}

describe('siblingPanelId / isSiblingPanelId / parseSiblingSessionId', () => {
  it('round-trips', () => {
    const id = siblingPanelId('abc')
    expect(id).toBe('agent:abc')
    expect(isSiblingPanelId(id)).toBe(true)
    expect(parseSiblingSessionId(id)).toBe('abc')
  })

  it('returns null for non-sibling ids', () => {
    expect(isSiblingPanelId('agent')).toBe(false)
    expect(parseSiblingSessionId('agent')).toBeNull()
    expect(parseSiblingSessionId('editor')).toBeNull()
  })
})

describe('getSiblingSessions / getPrimarySession / getExtraSiblings', () => {
  const a1 = makeSession('a1', '/w/a')
  const a2 = makeSession('a2', '/w/a')
  const a3 = makeSession('a3', '/w/a')
  const b1 = makeSession('b1', '/w/b')

  it('groups sessions by worktree', () => {
    const sessions = [a1, b1, a2, a3]
    expect(getSiblingSessions(sessions, '/w/a').map((s) => s.id)).toEqual(['a1', 'a2', 'a3'])
    expect(getSiblingSessions(sessions, '/w/b').map((s) => s.id)).toEqual(['b1'])
    expect(getSiblingSessions(sessions, null)).toEqual([])
  })

  it('primary is the first occurrence by order in array', () => {
    expect(getPrimarySession([a2, a1, a3], '/w/a')?.id).toBe('a2')
    expect(getPrimarySession([], '/w/a')).toBeNull()
  })

  it('extras are all but the primary', () => {
    expect(getExtraSiblings([a1, a2, a3], '/w/a').map((s) => s.id)).toEqual(['a2', 'a3'])
    expect(getExtraSiblings([a1], '/w/a')).toEqual([])
  })
})

describe('dedupeSessionsByWorktree', () => {
  it('keeps only the first session per worktree path', () => {
    const a1 = makeSession('a1', '/w/a')
    const a2 = makeSession('a2', '/w/a')
    const b1 = makeSession('b1', '/w/b')
    expect(dedupeSessionsByWorktree([a1, a2, b1]).map((s) => s.id)).toEqual(['a1', 'b1'])
  })

  it('keeps sessions without a worktree path', () => {
    const a = makeSession('a', '')
    const b = makeSession('b', '')
    expect(dedupeSessionsByWorktree([a, b]).map((s) => s.id)).toEqual(['a', 'b'])
  })
})
