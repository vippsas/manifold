import { describe, it, expect } from 'vitest'
import { groupVerdictsByProject } from './verdict-grouping'
import type { VerdictRecord } from '../../shared/verdict-types'

const rec = (projectId: string, n: number): VerdictRecord => ({
  sessionId: `${projectId}-${n}`, projectId, branch: 'b', runtime: 'claude',
  taskPrompt: { kind: 'full', text: 't' }, outcome: 'merged', createdAt: '2026-06-19T00:00:00Z',
  metrics: { agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0 },
})

describe('groupVerdictsByProject', () => {
  it('groups by project, resolves names, and sorts by name', () => {
    const out = groupVerdictsByProject(
      [rec('p2', 1), rec('p1', 1), rec('p2', 2)],
      [{ id: 'p1', name: 'Zebra' }, { id: 'p2', name: 'Apple' }],
    )
    expect(out.map((g) => g.projectName)).toEqual(['Apple', 'Zebra'])
    expect(out[0]).toEqual({ projectId: 'p2', projectName: 'Apple', records: [rec('p2', 1), rec('p2', 2)] })
  })

  it('falls back to projectId when the repo is no longer registered', () => {
    const out = groupVerdictsByProject([rec('gone', 1)], [])
    expect(out).toEqual([{ projectId: 'gone', projectName: 'gone', records: [rec('gone', 1)] }])
  })
})
