import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { gitLogByPath, gitStatusByPath } = vi.hoisted(() => ({
  gitLogByPath: new Map<string, string[]>(),
  gitStatusByPath: new Map<string, string[]>(),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const execFileSync = vi.fn((
    command: string,
    args: string[],
    options?: { cwd?: string; encoding?: string },
  ) => {
    if (command !== 'git') {
      throw new Error(`Unexpected command: ${command}`)
    }

    const cwd = options?.cwd
    if (!cwd) {
      throw new Error('Expected git command to provide cwd')
    }

    if (args[0] === 'log') {
      const maxCountArg = args.find((arg) => arg.startsWith('--max-count='))
      const maxCount = maxCountArg ? Number(maxCountArg.slice('--max-count='.length)) : Infinity
      const output = (gitLogByPath.get(cwd) ?? []).slice(0, maxCount).join('\n')
      return options?.encoding ? output : Buffer.from(output, 'utf-8')
    }

    if (args[0] === 'status') {
      const output = (gitStatusByPath.get(cwd) ?? []).join('\n')
      return options?.encoding ? output : Buffer.from(output, 'utf-8')
    }

    throw new Error(`Unexpected git args: ${args.join(' ')}`)
  })

  return {
    ...actual,
    default: {
      ...actual,
      execFileSync,
    },
    execFileSync,
  }
})

import { loadLocalProjectInput } from '../../../background-agent/connectors/local-project/local-project-loader'

const tempDirs: string[] = []

describe('loadLocalProjectInput', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) fs.rmSync(dir, { recursive: true, force: true })
    }
    gitLogByPath.clear()
    gitStatusByPath.clear()
  })

  it('loads top-level roadmap notes and recent PR-like commit hints', () => {
    const projectPath = createTempProject({
      'README.md': '# Project One\n\nAn Electron app for project-aware developer workflows.',
      'TODO': 'TODO: add a weekly digest\n- [ ] add an ecosystem watch section',
      'package.json': JSON.stringify({
        name: 'project-one',
        description: 'Project One',
        dependencies: {
          electron: '^35.0.0',
          react: '^18.0.0',
        },
      }),
    })

    seedGitHistory(projectPath, [
      'Add ecosystem watch groundwork (#123)',
      'Initial project scaffolding',
    ])

    const input = loadLocalProjectInput('project-1', 'Project One', projectPath)

    expect(input.documents.some((document) => document.path === 'TODO' && document.kind === 'note')).toBe(true)
    expect(input.recentChangeHints).toContain('Recent PR: Add ecosystem watch groundwork (#123)')
  })
})

function createTempProject(files: Record<string, string>): string {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-local-project-loader-'))
  tempDirs.push(projectPath)

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(projectPath, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf-8')
  }

  return projectPath
}

function seedGitHistory(projectPath: string, commits: string[], status: string[] = []): void {
  gitLogByPath.set(projectPath, commits)
  gitStatusByPath.set(projectPath, status)
}
