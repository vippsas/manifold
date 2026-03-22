import type { SearchQueryRequest, SearchQueryResponse, UnifiedSearchResult } from '../../shared/search-types'
import type { IpcDependencies } from '../ipc/types'
import { buildSearchRerankPrompt } from './search-prompt-builder'
import { resolveSearchAiRuntime } from './search-ai-runtime'

interface SearchRerankDeps {
  settingsStore: IpcDependencies['settingsStore']
  projectRegistry: IpcDependencies['projectRegistry']
  sessionManager: IpcDependencies['sessionManager']
  gitOps: IpcDependencies['gitOps']
}

const SEARCH_RERANK_TIMEOUT_MS = 45_000

export async function maybeRerankSearchResults(
  deps: SearchRerankDeps,
  request: SearchQueryRequest,
  retrieval: SearchQueryResponse,
): Promise<SearchQueryResponse> {
  const settings = deps.settingsStore?.getSettings?.()
  const aiSettings = settings?.search?.ai
  let failureContext = 'AI reranking failed.'
  if (!aiSettings?.enabled || aiSettings.mode !== 'rerank' || retrieval.results.length < 2) {
    return retrieval
  }

  try {
    const { runtimeId, runtime } = resolveSearchAiRuntime(
      { settingsStore: deps.settingsStore, sessionManager: deps.sessionManager },
      request.activeSessionId,
      aiSettings.runtimeId,
    )
    if (!runtimeId) {
      return appendWarning(retrieval, 'AI reranking runtime is not configured. Showing exact results.')
    }
    if (!runtime) {
      return appendWarning(retrieval, `AI reranking runtime not found: ${runtimeId}`)
    }
    failureContext = `AI reranking failed in ${runtime.name ?? runtimeId}.`

    const project = deps.projectRegistry.getProject(request.projectId)
    if (!project) {
      return appendWarning(retrieval, `AI reranking project not found: ${request.projectId}`)
    }

    const rerankPool = retrieval.results.slice(0, Math.max(2, aiSettings.maxContextResults))
    const prompt = buildSearchRerankPrompt(request.query, rerankPool)
    const cwd = request.activeSessionId
      ? deps.sessionManager.getSession(request.activeSessionId)?.worktreePath ?? project.path
      : project.path
    const output = await deps.gitOps.aiGenerate(
      runtime,
      prompt,
      cwd,
      runtime.aiModelArgs ?? [],
      { timeoutMs: SEARCH_RERANK_TIMEOUT_MS },
    )
    const reranked = reorderResults(rerankPool, output)
    if (!reranked) {
      return appendWarning(retrieval, 'AI reranking did not return a usable order. Showing exact results.')
    }

    return {
      ...retrieval,
      results: [...reranked, ...retrieval.results.slice(rerankPool.length)],
    }
  } catch (error) {
    const detail = ensureSentence(formatAiFailure(error))
    return appendWarning(retrieval, `${failureContext} ${detail} Showing exact results.`)
  }
}

function reorderResults(results: UnifiedSearchResult[], output: string): UnifiedSearchResult[] | null {
  const ids = [...output.matchAll(/\bS(\d+)\b/g)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter((index) => Number.isFinite(index) && index >= 1 && index <= results.length)

  if (ids.length === 0) return null

  const seen = new Set<number>()
  const ordered = ids
    .filter((index) => {
      if (seen.has(index)) return false
      seen.add(index)
      return true
    })
    .map((index) => results[index - 1])
    .filter(Boolean)

  const remainder = results.filter((_result, index) => !seen.has(index + 1))
  return [...ordered, ...remainder]
}

function appendWarning(response: SearchQueryResponse, warning: string): SearchQueryResponse {
  return {
    ...response,
    warnings: [...(response.warnings ?? []), warning],
  }
}

function formatAiFailure(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  return 'The runtime did not provide an error message.'
}

function ensureSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`
}
