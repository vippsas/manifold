import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebResearchClient } from '../../../background-agent/connectors/web/web-research-client'
import type { WebResearchContext, WebResearchResult, WebResearchTopic } from '../../../background-agent/connectors/web/web-research-types'
import { DEFAULT_SETTINGS } from '../../shared/defaults'
import { BackgroundAgentHost } from './background-agent-host'
import { BackgroundAgentStore } from './background-agent-store'

const tempDirs: string[] = []

describe('BackgroundAgentHost', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('deduplicates concurrent refreshes for the same project', async () => {
    const projectPath = createTempProject({
      'package.json': JSON.stringify({
        name: 'background-agent-test',
        description: 'Test project',
      }),
      'README.md': '# Test project\n\nA repo for background agent host tests.',
    })
    const stateFile = path.join(projectPath, '.background-agent-state.json')
    const store = new BackgroundAgentStore(stateFile)

    let resolveResearch: ((value: WebResearchResult[]) => void) | null = null
    const research = vi.fn((_topics: WebResearchTopic[], _context: WebResearchContext) => (
      new Promise<WebResearchResult[]>((resolve) => {
        resolveResearch = resolve
      })
    ))
    const webResearchClient: WebResearchClient = { research }

    const host = new BackgroundAgentHost({
      projectRegistry: {
        getProject: (projectId: string) => projectId === 'project-1'
          ? {
            id: 'project-1',
            name: 'Project One',
            path: projectPath,
            baseBranch: 'main',
            addedAt: '2026-03-30T00:00:00.000Z',
          }
          : null,
      },
      settingsStore: {
        getSettings: () => ({ ...DEFAULT_SETTINGS }),
      },
      sessionManager: {
        getSession: () => null,
      },
      gitOps: {} as never,
    } as never, {
      store,
      webResearchClient,
    })

    const firstRefresh = host.refreshSuggestions('project-1', null)
    const secondRefresh = host.refreshSuggestions('project-1', null)

    expect(research).toHaveBeenCalledTimes(1)
    expect(host.getStatus('project-1').isRefreshing).toBe(true)

    resolveResearch?.([])
    const [firstSnapshot, secondSnapshot] = await Promise.all([firstRefresh, secondRefresh])

    expect(firstSnapshot.status.phase).toBe('ready')
    expect(secondSnapshot.status.phase).toBe('ready')
    expect(host.getStatus('project-1').isRefreshing).toBe(false)
    expect(host.getStatus('project-1').summary).not.toContain('interrupted')
  })
})

function createTempProject(files: Record<string, string>): string {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-background-agent-host-'))
  tempDirs.push(projectPath)

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(projectPath, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf-8')
  }

  return projectPath
}
