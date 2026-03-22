import type { SearchAskRequest, SearchAskResponse, SearchQueryResponse, UnifiedSearchResult } from '../../shared/search-types'
import type { IpcDependencies } from '../ipc/types'
import { buildSearchAnswerPrompt } from './search-prompt-builder'
import { resolveSearchAiRuntime } from './search-ai-runtime'

interface AiSearchDeps {
  settingsStore: IpcDependencies['settingsStore']
  projectRegistry: IpcDependencies['projectRegistry']
  sessionManager: IpcDependencies['sessionManager']
  gitOps: IpcDependencies['gitOps']
}

const SEARCH_AI_ANSWER_TIMEOUT_MS = 90_000

export async function answerSearchQuestion(
  deps: AiSearchDeps,
  request: SearchAskRequest,
  retrieval: SearchQueryResponse,
): Promise<SearchAskResponse> {
  const startedAt = Date.now()
  const aiSettings = deps.settingsStore.getSettings().search?.ai

  if (!aiSettings?.enabled) {
    throw new Error('AI search is disabled in settings.')
  }
  if (aiSettings.mode !== 'answer') {
    throw new Error('AI answer mode is disabled because search AI is configured for rerank only.')
  }

  const citations = retrieval.results.slice(0, Math.max(1, aiSettings.maxContextResults))
  if (citations.length === 0) {
    return {
      answer: 'No grounded search results were found for this question.',
      citations: [],
      tookMs: Date.now() - startedAt,
    }
  }

  const { runtimeId, runtime } = resolveSearchAiRuntime(
    { settingsStore: deps.settingsStore, sessionManager: deps.sessionManager },
    request.search.activeSessionId,
    aiSettings.runtimeId,
  )
  if (!runtime) {
    throw new Error(`Search AI runtime not found: ${runtimeId}`)
  }

  const project = deps.projectRegistry.getProject(request.search.projectId)
  if (!project) {
    throw new Error(`Project not found: ${request.search.projectId}`)
  }

  const cwd = resolveSearchWorkingDirectory(deps.sessionManager, request.search.activeSessionId, project.path)
  const prompt = buildSearchAnswerPrompt(request.question, citations)
  const answer = await deps.gitOps.aiGenerate(
    runtime,
    prompt,
    cwd,
    runtime.aiModelArgs ?? [],
    { timeoutMs: SEARCH_AI_ANSWER_TIMEOUT_MS },
  )

  const usedCitations = extractUsedCitations(answer, citations, aiSettings.citationLimit)
  return {
    answer: ensureAnswerHasCitationTrail(answer, usedCitations),
    citations: usedCitations,
    tookMs: Date.now() - startedAt,
  }
}

function resolveSearchWorkingDirectory(
  sessionManager: AiSearchDeps['sessionManager'],
  activeSessionId: string | null,
  projectPath: string,
): string {
  if (!activeSessionId) return projectPath
  return sessionManager.getSession(activeSessionId)?.worktreePath ?? projectPath
}

function extractUsedCitations(
  answer: string,
  citations: UnifiedSearchResult[],
  citationLimit: number,
): UnifiedSearchResult[] {
  const ids = [...answer.matchAll(/\[S(\d+)\]/g)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter((id) => Number.isFinite(id) && id >= 1 && id <= citations.length)

  const unique = [...new Set(ids)].map((id) => citations[id - 1]).filter(Boolean)
  if (unique.length > 0) {
    return unique.slice(0, citationLimit)
  }

  return citations.slice(0, citationLimit)
}

function ensureAnswerHasCitationTrail(answer: string, citations: UnifiedSearchResult[]): string {
  if (citations.length === 0 || /\[S\d+\]/.test(answer)) {
    return answer
  }

  const fallbackIds = citations.slice(0, 3).map((_citation, index) => `[S${index + 1}]`).join(' ')
  return `${answer.trim()}\n\nSources: ${fallbackIds}`
}
