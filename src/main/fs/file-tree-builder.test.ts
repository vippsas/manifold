import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { buildFileTree } from './file-tree-builder'

describe('buildFileTree — excluded directories', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mani-tree-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  // Regression: worktrees symlink node_modules to the main checkout. A symlink's
  // Dirent.isDirectory() is false, so the EXCLUDED_DIRS filter missed it and the
  // builder followed the link (statSync) into the full dependency tree — a
  // multi-second synchronous walk that froze the UI on every agent switch.
  it('does not descend into a node_modules symlink', async () => {
    const realDeps = path.join(root, 'real-deps')
    fs.mkdirSync(path.join(realDeps, 'left-pad'), { recursive: true })
    fs.writeFileSync(path.join(realDeps, 'left-pad', 'index.js'), '')

    const repo = path.join(root, 'repo')
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'src', 'app.ts'), '')
    fs.symlinkSync(realDeps, path.join(repo, 'node_modules'))

    const names = ((await buildFileTree(repo)).children ?? []).map((child) => child.name)

    expect(names).toContain('src')
    expect(names).not.toContain('node_modules')
  })

  // A Dirent reports isDirectory() === false for a symlink, so trusting it
  // alone would turn a symlinked source folder into a leaf file. Only the
  // excluded names are cut; a linked folder the user browses is still a folder.
  it('descends into a symlinked directory that is not excluded', async () => {
    const shared = path.join(root, 'shared')
    fs.mkdirSync(shared, { recursive: true })
    fs.writeFileSync(path.join(shared, 'util.ts'), '')

    const repo = path.join(root, 'repo')
    fs.mkdirSync(repo, { recursive: true })
    fs.symlinkSync(shared, path.join(repo, 'linked'))

    const linked = (await buildFileTree(repo)).children?.find((c) => c.name === 'linked')

    expect(linked?.isDirectory).toBe(true)
    expect(linked?.children?.map((c) => c.name)).toEqual(['util.ts'])
  })

  // The walk runs in the main process, and every agent switch triggers one. A
  // synchronous walk holds the event loop for its whole duration — hundreds of
  // milliseconds on a small repo, tens of seconds on a large checkout — which
  // is what put the macOS spinner over the window. Proof it yields: a timer
  // armed alongside the walk must fire before the walk resolves.
  it('yields to the event loop while walking', async () => {
    for (let i = 0; i < 40; i++) {
      const dir = path.join(root, `pkg-${i}`, 'src')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'index.ts'), '')
    }

    let timerFired = false
    const walk = buildFileTree(root)
    setTimeout(() => { timerFired = true }, 0)
    await walk

    expect(timerFired).toBe(true)
  })
})
