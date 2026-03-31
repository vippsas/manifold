import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { loadLocalProjectInput } from '../../../background-agent/connectors/local-project/local-project-loader'

const tempDirs: string[] = []

describe('loadLocalProjectInput', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) fs.rmSync(dir, { recursive: true, force: true })
    }
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

    initGitRepo(projectPath)
    commitAll(projectPath, 'Initial project scaffolding')
    fs.writeFileSync(path.join(projectPath, 'README.md'), '# Project One\n\nAn Electron app for project-aware developer workflows.\n\nUpdated.', 'utf-8')
    commitAll(projectPath, 'Add ecosystem watch groundwork (#123)')

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

function initGitRepo(projectPath: string): void {
  execFileSync('git', ['init'], { cwd: projectPath, stdio: ['ignore', 'ignore', 'ignore'] })
  execFileSync('git', ['config', 'user.email', 'codex@example.com'], { cwd: projectPath, stdio: ['ignore', 'ignore', 'ignore'] })
  execFileSync('git', ['config', 'user.name', 'Codex'], { cwd: projectPath, stdio: ['ignore', 'ignore', 'ignore'] })
}

function commitAll(projectPath: string, message: string): void {
  execFileSync('git', ['add', '.'], { cwd: projectPath, stdio: ['ignore', 'ignore', 'ignore'] })
  execFileSync('git', ['commit', '-m', message], { cwd: projectPath, stdio: ['ignore', 'ignore', 'ignore'] })
}
