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
  it('does not descend into a node_modules symlink', () => {
    const realDeps = path.join(root, 'real-deps')
    fs.mkdirSync(path.join(realDeps, 'left-pad'), { recursive: true })
    fs.writeFileSync(path.join(realDeps, 'left-pad', 'index.js'), '')

    const repo = path.join(root, 'repo')
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'src', 'app.ts'), '')
    fs.symlinkSync(realDeps, path.join(repo, 'node_modules'))

    const names = (buildFileTree(repo).children ?? []).map((child) => child.name)

    expect(names).toContain('src')
    expect(names).not.toContain('node_modules')
  })
})
