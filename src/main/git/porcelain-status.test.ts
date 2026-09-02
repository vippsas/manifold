import { describe, it, expect } from 'vitest'
import { parseWorkspaceStatus } from './porcelain-status'

/** Porcelain lines are `XY<space>path`. X is the index column, Y the worktree
 *  column — the distinction the Source Control view's staged/unstaged split
 *  rests on, and the one `parseStatusWithConflicts` deliberately collapses. */
function status(...lines: string[]): string {
  return `${lines.join('\n')}\n`
}

describe('parseWorkspaceStatus', () => {
  it('reads the index column into staged', () => {
    const { staged, unstaged } = parseWorkspaceStatus(status('M  src/a.ts'))
    expect(staged).toEqual([{ path: 'src/a.ts', type: 'modified' }])
    expect(unstaged).toEqual([])
  })

  it('reads the worktree column into unstaged', () => {
    const { staged, unstaged } = parseWorkspaceStatus(status(' M src/a.ts'))
    expect(staged).toEqual([])
    expect(unstaged).toEqual([{ path: 'src/a.ts', type: 'modified' }])
  })

  it('lists a file staged and then modified again in both groups', () => {
    const { staged, unstaged } = parseWorkspaceStatus(status('MM src/a.ts'))
    expect(staged).toEqual([{ path: 'src/a.ts', type: 'modified' }])
    expect(unstaged).toEqual([{ path: 'src/a.ts', type: 'modified' }])
  })

  it('maps added and deleted from whichever column holds them', () => {
    const { staged, unstaged } = parseWorkspaceStatus(status(
      'A  src/new.ts',
      'D  src/gone.ts',
      ' D src/vanished.ts',
    ))
    expect(staged).toEqual([
      { path: 'src/new.ts', type: 'added' },
      { path: 'src/gone.ts', type: 'deleted' },
    ])
    expect(unstaged).toEqual([{ path: 'src/vanished.ts', type: 'deleted' }])
  })

  it('puts untracked files in their own group, not in unstaged', () => {
    const { staged, unstaged, untracked } = parseWorkspaceStatus(status('?? src/untracked.ts'))
    expect(staged).toEqual([])
    expect(unstaged).toEqual([])
    expect(untracked).toEqual([{ path: 'src/untracked.ts', type: 'added' }])
  })

  it('keeps untracked files out of a stage-all over the unstaged group', () => {
    const { unstaged, untracked } = parseWorkspaceStatus(status(
      ' M src/edited.ts',
      '?? src/brand-new.ts',
    ))
    expect(unstaged).toEqual([{ path: 'src/edited.ts', type: 'modified' }])
    expect(untracked).toEqual([{ path: 'src/brand-new.ts', type: 'added' }])
  })

  it('keeps the destination path of a rename', () => {
    const { staged, unstaged } = parseWorkspaceStatus(status('R  src/old.ts -> src/new.ts'))
    expect(staged).toEqual([{ path: 'src/new.ts', type: 'modified' }])
    expect(unstaged).toEqual([])
  })

  it('reports a rename edited afterwards under the destination in both groups', () => {
    const { staged, unstaged } = parseWorkspaceStatus(status('RM src/old.ts -> src/new.ts'))
    expect(staged).toEqual([{ path: 'src/new.ts', type: 'modified' }])
    expect(unstaged).toEqual([{ path: 'src/new.ts', type: 'modified' }])
  })

  // A conflicted file's index holds every side of the merge, so staging it from
  // the view would commit the markers. It belongs on the unstaged side until
  // it's resolved, never in the staged group.
  it('puts conflicts in unstaged only', () => {
    const { staged, unstaged } = parseWorkspaceStatus(status(
      'UU src/both.ts',
      'AA src/added.ts',
      'DD src/dropped.ts',
    ))
    expect(staged).toEqual([])
    expect(unstaged).toEqual([
      { path: 'src/both.ts', type: 'modified' },
      { path: 'src/added.ts', type: 'added' },
      { path: 'src/dropped.ts', type: 'deleted' },
    ])
  })

  it('ignores blank and truncated lines', () => {
    expect(parseWorkspaceStatus('\n\nM\n')).toEqual({ staged: [], unstaged: [], untracked: [] })
  })

  it('returns empty groups for a clean checkout', () => {
    expect(parseWorkspaceStatus('')).toEqual({ staged: [], unstaged: [], untracked: [] })
  })
})
