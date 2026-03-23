// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createBundledTemplateSource, ensureSharedTemplateRepo, getBundledTemplates } from './oss-provisioner-core'

const createdPaths = new Set<string>()

function registerPath(targetPath: string): void {
  createdPaths.add(targetPath)
}

afterEach(() => {
  for (const targetPath of createdPaths) {
    fs.rmSync(targetPath, { recursive: true, force: true })
  }
  createdPaths.clear()
})

describe('oss-provisioner-core', () => {
  it('defines the bundled web app template', () => {
    const templates = getBundledTemplates()
    expect(templates).toEqual([
      expect.objectContaining({
        id: 'web-react-vite',
        title: 'Web App',
        category: 'Web',
      }),
    ])
  })

  it('creates a real starter repo with app files and agent notes', async () => {
    const result = await createBundledTemplateSource('web-react-vite', {
      name: 'feedback-board',
      description: 'Track customer feedback locally.',
    })

    registerPath(result.repoUrl)

    expect(result.displayName).toBe('feedback-board')
    expect(fs.existsSync(path.join(result.repoUrl, '.git'))).toBe(true)
    expect(fs.readFileSync(path.join(result.repoUrl, 'package.json'), 'utf-8')).toContain('"name": "feedback-board"')
    expect(fs.readFileSync(path.join(result.repoUrl, 'README.md'), 'utf-8')).toContain('Track customer feedback locally.')
    expect(fs.existsSync(path.join(result.repoUrl, 'AGENTS.md'))).toBe(true)
    expect(fs.existsSync(path.join(result.repoUrl, 'src', 'App.tsx'))).toBe(true)
    expect(fs.existsSync(path.join(result.repoUrl, 'src', 'db.ts'))).toBe(true)
  })

  it('returns a distinct repo for each create while reusing the shared template internally', async () => {
    const shared = await ensureSharedTemplateRepo('web-react-vite')
    registerPath(shared)

    const first = await createBundledTemplateSource('web-react-vite', {
      name: 'planner-one',
      description: 'First app',
    })
    const second = await createBundledTemplateSource('web-react-vite', {
      name: 'planner-two',
      description: 'Second app',
    })

    registerPath(first.repoUrl)
    registerPath(second.repoUrl)

    expect(first.repoUrl).not.toBe(second.repoUrl)
    expect(first.repoUrl).not.toBe(shared)
    expect(second.repoUrl).not.toBe(shared)

    const firstOrigin = execFileSync('git', ['remote'], { cwd: first.repoUrl }).toString('utf8').trim()
    const secondOrigin = execFileSync('git', ['remote'], { cwd: second.repoUrl }).toString('utf8').trim()
    expect(firstOrigin).toBe('')
    expect(secondOrigin).toBe('')
  })
})
