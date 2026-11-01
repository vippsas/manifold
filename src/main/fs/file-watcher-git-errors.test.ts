import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { gitStatus } from './file-watcher-utils'
import { isGitRepositoryError } from '../git/git-errors'

let folder: string | undefined

afterEach(() => {
  if (folder) rmSync(folder, { recursive: true, force: true })
})

it('preserves the local git diagnostic that disables polling a plain folder', async () => {
  folder = mkdtempSync(path.join(os.tmpdir(), 'manifold-non-git-'))
  const error = await gitStatus(folder).catch((err: unknown) => err)
  expect(error).toBeInstanceOf(Error)
  expect(isGitRepositoryError(error)).toBe(true)
})
