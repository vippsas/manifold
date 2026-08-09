import { describe, it, expect } from 'vitest'
import type { SerializedDockview } from 'dockview'
import { readRememberedSize } from './dock-layout-loader'

type Ori = 'HORIZONTAL' | 'VERTICAL'

const leaf = (views: string[], size = 100): unknown => ({
  type: 'leaf', size, data: { id: views.join('-'), views, activeView: views[0] },
})
const branch = (data: unknown[], size = 300): unknown => ({ type: 'branch', size, data })

function snap(root: unknown, orientation: Ori = 'HORIZONTAL'): SerializedDockview {
  return { grid: { root, width: 1000, height: 700, orientation }, panels: {} } as unknown as SerializedDockview
}

describe('readRememberedSize', () => {
  it('reads a top-level pane of a horizontal grid as a width', () => {
    const root = branch([leaf(['sidebar']), leaf(['agent']), leaf(['shell'], 250)])
    expect(readRememberedSize(snap(root, 'HORIZONTAL'), 'shell')).toEqual({ axis: 'width', px: 250 })
  })

  it('reads a nested pane as a height, since branch orientation alternates', () => {
    const center = branch([leaf(['agent']), leaf(['shell'], 200)]) // nested branch → VERTICAL
    const root = branch([leaf(['sidebar']), center])
    expect(readRememberedSize(snap(root, 'HORIZONTAL'), 'shell')).toEqual({ axis: 'height', px: 200 })
  })

  it('follows the grid orientation rather than assuming horizontal', () => {
    const root = branch([branch([leaf(['sidebar']), leaf(['agent'])]), leaf(['shell'], 180)])
    expect(readRememberedSize(snap(root, 'VERTICAL'), 'shell')).toEqual({ axis: 'height', px: 180 })
  })

  it('finds a pane that shared a tab group', () => {
    const root = branch([leaf(['sidebar']), leaf(['agent', 'editor'], 640)])
    expect(readRememberedSize(snap(root), 'editor')).toEqual({ axis: 'width', px: 640 })
  })

  it('ignores a pane that filled the whole dock — its size says nothing', () => {
    expect(readRememberedSize(snap(leaf(['shell'])), 'shell')).toBeUndefined()
  })

  it('ignores a pane the snapshot does not contain', () => {
    const root = branch([leaf(['sidebar']), leaf(['agent'])])
    expect(readRememberedSize(snap(root), 'shell')).toBeUndefined()
  })

  it('ignores a zero size (a collapsed pane restores from its own path)', () => {
    const root = branch([leaf(['sidebar'], 0), leaf(['agent'])])
    expect(readRememberedSize(snap(root), 'sidebar')).toBeUndefined()
  })
})
