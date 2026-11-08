// @vitest-environment node
import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import chokidar from 'chokidar'
import type { BrowserWindow } from 'electron'
import { afterEach, expect, it, vi } from 'vitest'
import { FileWatcher } from './file-watcher'
import { gitStatus } from './file-watcher-utils'
import { ChokidarTreeWatcher } from './tree-watcher'

const run = promisify(execFile)
let watcher: FileWatcher | undefined
let root: string | undefined

afterEach(async () => {
  await watcher?.unwatchAll()
  if (root) await rm(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

it.each([
  { name: 'a file nested in an already-untracked directory', file: 'docs/sub/two.ts', git: true },
  { name: 'a gitignored file', file: 'out.log', git: true },
  { name: 'a nested directory', file: 'docs/sub/newdir', git: true, directory: true },
  { name: 'a file in a non-git folder', file: 'docs/sub/two.ts', git: false },
])('notifies additional-dir trees about $name without a git status change', async ({ file, git, directory }) => {
  root = await mkdtemp(join(tmpdir(), 'manifold-tree-'))
  await mkdir(join(root, 'docs/sub'), { recursive: true })
  await writeFile(join(root, 'docs/one.ts'), 'one')
  await writeFile(join(root, '.gitignore'), '*.log\n')
  if (git) await run('git', ['init', '--quiet', root])
  const status = git ? await gitStatus(root) : ''
  const watch = vi.spyOn(chokidar, 'watch')
  const send = vi.fn()
  watcher = new FileWatcher(gitStatus, new ChokidarTreeWatcher())
  watcher.setMainWindow({ isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow)
  // Keep the original source spelling for renderer hooks that match it exactly.
  watcher.watchAdditionalDir(`${root}/`, 'session-1')
  expect(watch).toHaveBeenCalledTimes(1)
  await once(watch.mock.results[0].value, 'ready')
  const target = join(root, file)
  if (directory) await mkdir(target)
  else await writeFile(target, 'two')

  await vi.waitFor(() => {
    expect(send).toHaveBeenCalledWith('files:tree-changed', {
      sessionId: 'session-1', rootPath: root, source: `${root}/`,
    })
  }, { timeout: 3000 })
  if (git) expect(await gitStatus(root)).toBe(status)
})
