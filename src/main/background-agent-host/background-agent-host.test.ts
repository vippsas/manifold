import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebResearchClient } from '../../../background-agent/connectors/web/web-research-client'
import type { WebResearchContext, WebResearchResult, WebResearchSourceRecord, WebResearchTopic } from '../../../background-agent/connectors/web/web-research-types'
import type { BackgroundAgentSuggestion } from '../../../background-agent/schemas/background-agent-types'
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
    const research = vi.fn((topics: WebResearchTopic[], _context: WebResearchContext) => {
      if (!resolveResearch) {
        return new Promise<WebResearchResult[]>((resolve) => {
          resolveResearch = resolve
        })
      }
      return Promise.resolve(topics.map(createResearchResult))
    })
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

    resolveResearch?.(firstTopics(webResearchClient).map(createResearchResult))
    const [firstSnapshot, secondSnapshot] = await Promise.all([firstRefresh, secondRefresh])

    expect(firstSnapshot.status.phase).toBe('ready')
    expect(secondSnapshot.status.phase).toBe('ready')
    expect(host.getStatus('project-1').isRefreshing).toBe(false)
    expect(host.getStatus('project-1').summary).not.toContain('interrupted')
  })

  it('clears persisted ideas for a project', () => {
    const projectPath = createTempProject({
      'package.json': JSON.stringify({
        name: 'background-agent-test',
        description: 'Test project',
      }),
      'README.md': '# Test project\n\nA repo for background agent host tests.',
    })
    const stateFile = path.join(projectPath, '.background-agent-state.json')
    const store = new BackgroundAgentStore(stateFile)

    store.setProjectState('project-1', {
      profile: {
        projectId: 'project-1',
        projectName: 'Project One',
        projectPath,
        summary: 'Existing profile',
        productType: 'Developer tool',
        targetUser: 'Developers',
        majorWorkflows: ['Ideas research'],
        architectureShape: 'Electron desktop app',
        dependencyStack: ['electron'],
        openQuestions: ['What should we build next?'],
        recentChanges: ['Recent PR: Add ideas feed'],
        sourcePaths: ['README.md'],
        generatedAt: '2026-03-31T00:00:00.000Z',
      },
      suggestions: [{
        id: 'idea-1',
        title: 'Existing idea',
        category: 'feature_opportunity',
        summary: 'Existing summary',
        whyItMatters: 'Existing reason',
        whyNow: null,
        supportingSources: [],
        evidence: [],
        confidence: 'medium',
        novelty: 'medium',
        effort: 'medium',
        impact: 'medium',
        createdAt: '2026-03-31T00:00:00.000Z',
      }],
      status: {
        phase: 'ready',
        isRefreshing: false,
        refreshState: 'idle',
        lastRefreshedAt: '2026-03-31T00:00:00.000Z',
        error: null,
        summary: 'Prepared 1 idea.',
        detail: null,
        stepLabel: null,
        recentActivity: ['Prepared 1 idea.'],
      },
      feedback: [],
      pendingRefresh: null,
    })

    const host = new BackgroundAgentHost({
      projectRegistry: {
        getProject: () => null,
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
      webResearchClient: { research: vi.fn(async () => []) },
    })

    const cleared = host.clearSuggestions('project-1')

    expect(cleared).toEqual({
      profile: null,
      suggestions: [],
      status: {
        phase: 'idle',
        isRefreshing: false,
        refreshState: 'idle',
        lastRefreshedAt: null,
        error: null,
        summary: null,
        detail: null,
        stepLabel: null,
        recentActivity: [],
      },
    })
    expect(store.getProjectState('project-1').feedback).toEqual([])
  })

  it('pauses after the active topic and resumes from the saved checkpoint', async () => {
    const projectPath = createTempProject({
      'package.json': JSON.stringify({ name: 'background-agent-test', description: 'Test project' }),
      'README.md': '# Test project\n\nA repo for background agent host tests.',
    })
    const store = new BackgroundAgentStore(path.join(projectPath, '.background-agent-state.json'))
    let resolveFirstTopic: ((value: WebResearchResult[]) => void) | null = null
    const webResearchClient: WebResearchClient = {
      research: vi.fn((topics: WebResearchTopic[]) => {
        if (!resolveFirstTopic) {
          return new Promise<WebResearchResult[]>((resolve) => {
            resolveFirstTopic = resolve
          })
        }
        return Promise.resolve(topics.map(createResearchResult))
      }),
    }
    const host = createHost(projectPath, store, webResearchClient)

    const refreshPromise = host.refreshSuggestions('project-1', null)
    await vi.waitFor(() => expect(webResearchClient.research).toHaveBeenCalledTimes(1))

    const pauseRequested = host.pauseSuggestions('project-1')
    expect(pauseRequested.status.refreshState).toBe('pause_requested')

    resolveFirstTopic?.(firstTopics(webResearchClient).map(createResearchResult))
    const pausedSnapshot = await refreshPromise

    expect(pausedSnapshot.status.refreshState).toBe('paused')
    expect(pausedSnapshot.status.isRefreshing).toBe(false)
    expect(store.getProjectState('project-1').pendingRefresh?.completedResults).toHaveLength(1)

    const resumedSnapshot = await host.resumeSuggestions('project-1', null)

    expect(resumedSnapshot.status.phase).toBe('ready')
    expect(resumedSnapshot.status.refreshState).toBe('idle')
    expect(webResearchClient.research).toHaveBeenCalledTimes(6)
  })

  it('counts feedback recorded mid-run toward that run\'s ranking', async () => {
    const projectPath = createTempProject({
      'package.json': JSON.stringify({ name: 'background-agent-test', description: 'Test project' }),
      'README.md': '# Test project\n\nA repo for background agent host tests.',
    })
    const store = new BackgroundAgentStore(path.join(projectPath, '.background-agent-state.json'))

    // Suggestion ids are deterministic: `${projectId}:${topicId}:${slug(title)}`.
    const demoteId = 'project-1:feedback-topic:demote-me'
    const keepId = 'project-1:feedback-topic:keep-me'

    // Seed a prior ready run so mid-run feedback can target an existing suggestion.
    const seeded = store.getProjectState('project-1')
    seeded.suggestions = [
      seedSuggestion(demoteId, 'Demote me'),
      seedSuggestion(keepId, 'Keep me'),
    ]
    seeded.status = { ...seeded.status, phase: 'ready' }
    store.setProjectState('project-1', seeded)

    let resolveFirstTopic: ((value: WebResearchResult[]) => void) | null = null
    let firstCall = true
    const webResearchClient: WebResearchClient = {
      research: vi.fn((topics: WebResearchTopic[]) => {
        if (firstCall) {
          firstCall = false
          return new Promise<WebResearchResult[]>((resolve) => {
            resolveFirstTopic = resolve
          })
        }
        return Promise.resolve(topics.map(createResearchResult))
      }),
    }
    const host = createHost(projectPath, store, webResearchClient)

    const refreshPromise = host.refreshSuggestions('project-1', null)
    await vi.waitFor(() => expect(webResearchClient.research).toHaveBeenCalledTimes(1))

    // Record negative feedback on "Demote me" while research is still pending.
    host.recordFeedback('project-1', demoteId, 'not_relevant')

    // Finish research: this run synthesizes both ids with identical scores; the
    // mid-run feedback must demote "Demote me" below "Keep me" in this run.
    resolveFirstTopic?.([candidateResearchResult()])
    const snapshot = await refreshPromise

    expect(snapshot.status.phase).toBe('ready')
    const order = snapshot.suggestions.map((suggestion) => suggestion.id)
    expect(order).toEqual([keepId, demoteId])
  })

  it('stops a paused refresh and discards the resume checkpoint', async () => {
    const projectPath = createTempProject({
      'package.json': JSON.stringify({ name: 'background-agent-test', description: 'Test project' }),
      'README.md': '# Test project\n\nA repo for background agent host tests.',
    })
    const store = new BackgroundAgentStore(path.join(projectPath, '.background-agent-state.json'))
    let resolveFirstTopic: ((value: WebResearchResult[]) => void) | null = null
    const webResearchClient: WebResearchClient = {
      research: vi.fn((_topics: WebResearchTopic[]) => (
        new Promise<WebResearchResult[]>((resolve) => {
          resolveFirstTopic = resolve
        })
      )),
    }
    const host = createHost(projectPath, store, webResearchClient)

    const refreshPromise = host.refreshSuggestions('project-1', null)
    await vi.waitFor(() => expect(webResearchClient.research).toHaveBeenCalledTimes(1))
    host.pauseSuggestions('project-1')
    resolveFirstTopic?.(firstTopics(webResearchClient).map(createResearchResult))
    await refreshPromise

    const stoppedSnapshot = host.stopSuggestions('project-1')

    expect(stoppedSnapshot.status.refreshState).toBe('stopped')
    expect(store.getProjectState('project-1').pendingRefresh).toBeNull()
  })

  it('aborts the in-flight model subprocess on stop and discards the interrupted topic', async () => {
    const projectPath = createTempProject({
      'package.json': JSON.stringify({ name: 'background-agent-test', description: 'Test project' }),
      'README.md': '# Test project\n\nA repo for background agent host tests.',
    })
    const store = new BackgroundAgentStore(path.join(projectPath, '.background-agent-state.json'))

    let capturedSignal: AbortSignal | undefined
    let resolveResearch: ((value: WebResearchResult[]) => void) | null = null
    const webResearchClient: WebResearchClient = {
      // Mimic the real client: when aborted, the killed subprocess yields no
      // result for the interrupted topic (empty array).
      research: vi.fn((_topics: WebResearchTopic[], _ctx: WebResearchContext, _onProgress, signal?: AbortSignal) => {
        capturedSignal = signal
        return new Promise<WebResearchResult[]>((resolve) => {
          resolveResearch = resolve
          signal?.addEventListener('abort', () => resolve([]))
        })
      }),
    }
    const host = createHost(projectPath, store, webResearchClient)

    const refreshPromise = host.refreshSuggestions('project-1', null)
    await vi.waitFor(() => expect(webResearchClient.research).toHaveBeenCalledTimes(1))
    expect(capturedSignal?.aborted).toBe(false)

    const stopRequested = host.stopSuggestions('project-1')
    expect(stopRequested.status.refreshState).toBe('stop_requested')
    // Stop aborts the signal threaded into the running topic's model subprocess.
    expect(capturedSignal?.aborted).toBe(true)

    const stoppedSnapshot = await refreshPromise

    expect(stoppedSnapshot.status.refreshState).toBe('stopped')
    expect(store.getProjectState('project-1').pendingRefresh).toBeNull()
    // The interrupted topic is not recorded as completed.
    expect(resolveResearch).not.toBeNull()
  })
})

function createHost(projectPath: string, store: BackgroundAgentStore, webResearchClient: WebResearchClient): BackgroundAgentHost {
  return new BackgroundAgentHost({
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
}

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

function createResearchResult(topic: WebResearchTopic): WebResearchResult {
  return {
    topic,
    topicSummary: '',
    findings: [],
    sources: [],
    candidateSuggestions: [],
  }
}

function firstTopics(webResearchClient: WebResearchClient): WebResearchTopic[] {
  return (webResearchClient.research as ReturnType<typeof vi.fn>).mock.calls[0][0] as WebResearchTopic[]
}

function seedSuggestion(id: string, title: string): BackgroundAgentSuggestion {
  return {
    id,
    title,
    category: 'feature_opportunity',
    summary: `${title} for the current project.`,
    whyItMatters: 'It matches the current workflow.',
    whyNow: null,
    supportingSources: [
      {
        id: 'official',
        title: 'Official docs',
        url: 'https://example.com/docs',
        type: 'official_docs',
        trust: 'high',
        publishedAt: '2026-03-20',
        note: 'A concrete source note.',
      },
      {
        id: 'repo',
        title: 'OSS repo',
        url: 'https://github.com/example/repo',
        type: 'oss_repo',
        trust: 'high',
        publishedAt: '2026-03-20',
        note: 'A concrete source note.',
      },
    ],
    evidence: ['Some evidence.'],
    confidence: 'medium',
    novelty: 'medium',
    effort: 'medium',
    impact: 'medium',
    createdAt: '2026-03-31T07:00:00.000Z',
  }
}

// Returns a research result whose candidates synthesize to deterministic ids
// `project-1:feedback-topic:demote-me` and `project-1:feedback-topic:keep-me`,
// both with identical ranking scores so feedback alone breaks the tie.
function candidateResearchResult(): WebResearchResult {
  const sources: WebResearchSourceRecord[] = [
    { title: 'Official docs', url: 'https://example.com/docs', type: 'official_docs', publishedAt: '2026-03-20' },
    { title: 'OSS repo', url: 'https://github.com/example/repo', type: 'oss_repo', publishedAt: '2026-03-20' },
  ]
  const hint = (title: string) => ({
    title,
    category: 'feature_opportunity' as const,
    summary: `${title} for the current project.`,
    whyItMatters: 'It matches the current workflow.',
    whyNow: null,
    evidence: ['Some evidence.'],
    confidence: 'medium' as const,
    novelty: 'medium' as const,
    effort: 'medium' as const,
    impact: 'medium' as const,
  })
  return {
    topic: { id: 'feedback-topic', title: 'Feedback topic', query: 'q', ring: 1, rationale: 'r' },
    topicSummary: '',
    findings: [],
    sources,
    candidateSuggestions: [hint('Demote me'), hint('Keep me')],
  }
}
