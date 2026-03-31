import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebResearchContext, WebResearchTopic } from '../../../background-agent/connectors/web/web-research-types'

const runBackgroundAgentPromptMock = vi.hoisted(() => vi.fn())
const buildResearchPromptMock = vi.hoisted(() => vi.fn(() => 'PROMPT'))

vi.mock('./background-agent-runtime', () => ({
  runBackgroundAgentPrompt: runBackgroundAgentPromptMock,
}))

vi.mock('./background-agent-research-prompt', () => ({
  buildResearchPrompt: buildResearchPromptMock,
}))

describe('RuntimeWebResearchClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildResearchPromptMock.mockReturnValue('PROMPT')
  })

  it('retries once when a research run ends without a usable final answer', async () => {
    const { RuntimeWebResearchClient } = await import('./background-agent-research-client')
    runBackgroundAgentPromptMock
      .mockRejectedValueOnce(new Error('AI runtime "codex" returned no usable output (exit code 0).'))
      .mockResolvedValueOnce(JSON.stringify({
        topicSummary: 'Summary',
        findings: ['Finding'],
        sources: [{
          title: 'OpenAI docs',
          url: 'https://developers.openai.com',
          type: 'official_docs',
          publishedAt: '2026-03-31',
        }],
        candidateSuggestions: [{
          title: 'Suggestion',
          category: 'feature_opportunity',
          summary: 'Ship a better research pass.',
          whyItMatters: 'Improves result quality.',
          whyNow: null,
          evidence: ['Codex recovered on retry.'],
          confidence: 'high',
          novelty: 'medium',
          effort: 'medium',
          impact: 'high',
        }],
      }))

    const progress = vi.fn()
    const client = new RuntimeWebResearchClient(createDeps())
    const [result] = await client.research([createTopic()], createContext('codex'), progress)

    expect(runBackgroundAgentPromptMock).toHaveBeenCalledTimes(2)
    expect(result.sources).toHaveLength(1)
    expect(result.candidateSuggestions).toHaveLength(1)
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'topic_started',
      message: 'Retrying competitor feature patterns after the previous research run stalled.',
      detail: 'research run ended without a final answer',
    }))
  })

  it('does not retry deterministic runtime configuration errors', async () => {
    const { RuntimeWebResearchClient } = await import('./background-agent-research-client')
    runBackgroundAgentPromptMock.mockRejectedValueOnce(
      new Error('AI runtime "codex" failed (exit code 1): Unsupported value: high'),
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const client = new RuntimeWebResearchClient(createDeps())
    const [result] = await client.research([createTopic()], createContext('codex'))

    expect(runBackgroundAgentPromptMock).toHaveBeenCalledTimes(1)
    expect(result.sources).toEqual([])
    expect(result.candidateSuggestions).toEqual([])

    warnSpy.mockRestore()
  })
})

function createDeps() {
  return {
    settingsStore: {},
    projectRegistry: {},
    sessionManager: {},
    gitOps: {},
  } as never
}

function createTopic(): WebResearchTopic {
  return {
    id: 'competitor-feature-patterns',
    title: 'Competitor feature patterns',
    query: 'developer tool feature patterns',
    ring: 1,
    rationale: 'Find adjacent patterns.',
  }
}

function createContext(runtimeId: string): WebResearchContext {
  return {
    projectProfile: {
      projectId: 'project-1',
      projectName: 'Example Project',
      projectPath: '/repo',
      summary: 'A project used for tests.',
      productType: 'developer tool',
      targetUser: 'developers',
      majorWorkflows: ['researching product ideas'],
      architectureShape: 'electron app',
      dependencyStack: ['typescript', 'electron'],
      openQuestions: ['How deep should research go?'],
      recentChanges: ['Introduced background research.'],
      sourcePaths: ['README.md'],
      generatedAt: '2026-03-31T00:00:00.000Z',
    },
    runtimeContext: {
      activeSessionId: null,
      runtimeId,
      worktreePath: '/repo',
      mode: 'non-interactive',
    },
  }
}
