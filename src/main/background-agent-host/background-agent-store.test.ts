import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BackgroundAgentStore } from './background-agent-store'

const tempDirs: string[] = []

describe('BackgroundAgentStore', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('loads legacy project state without recentChanges and normalizes missing arrays', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-background-agent-store-'))
    tempDirs.push(tempDir)
    const stateFile = path.join(tempDir, 'state.json')

    fs.writeFileSync(stateFile, JSON.stringify({
      projects: {
        'project-1': {
          profile: {
            projectId: 'project-1',
            projectName: 'Manifold',
            projectPath: '/repo',
            summary: 'Legacy profile',
            productType: 'Developer tool',
            targetUser: 'Developers',
            majorWorkflows: ['Ideas research'],
            architectureShape: 'Electron desktop app',
            dependencyStack: ['electron'],
            openQuestions: ['What should we build next?'],
            sourcePaths: ['README.md'],
            generatedAt: '2026-03-31T07:00:00.000Z',
          },
          suggestions: [],
          status: {
            phase: 'ready',
            isRefreshing: false,
            refreshState: 'idle',
            lastRefreshedAt: null,
            error: null,
            summary: null,
            detail: null,
            stepLabel: null,
          },
        },
      },
    }), 'utf-8')

    const store = new BackgroundAgentStore(stateFile)
    const state = store.getProjectState('project-1')

    expect(state.profile?.recentChanges).toEqual([])
    expect(state.feedback).toEqual([])
    expect(state.status.recentActivity).toEqual([])
  })
})
