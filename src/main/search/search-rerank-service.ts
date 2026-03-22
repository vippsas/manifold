import { getRuntimeById } from '../agent/runtimes'
import type { SearchQueryRequest, SearchQueryResponse, UnifiedSearchResult } from '../../shared/search-types'
import type { IpcDependencies } from '../ipc/types'
import { buildSearchRerankPrompt } from './search-prompt-builder'

interface SearchRerankDeps {
  settingsStore: IpcDependencies['settingsStore']
  projectRegistry: IpcDependencies['projectRegistry']
  sessionManager: IpcDependencies['sessionManager']
  gitOps: IpcDependencies['gitOps']
}

export async function maybeRerankSearchResults(
  deps: SearchRerankDeps,
  request: SearchQueryRequest,
  retrieval: SearchQueryResponse,
): Promise<SearchQueryResponse> {
  const settings = deps.settingsStore?.getSettings?.()
  const aiSettings = settings?.search?.ai
  if (!aiSettings?.enabled || aiSettings.mode !== 'rerank' || retrieval.results.length < 2) {
    return retrieval
  }

  try {
    const runtimeId = aiSettings.runtimeId === 'default'
      ? settings?.defaultRuntime
      : aiSettings.runtimeId
    if (!runtimeId) {
      return appendWarning(retrieval, 'AI reranking runtime is not configured. Showing exact results.')
    }
    const runtime = getRuntimeById(runtimeId)
    if (!runtime) {
      return appendWarning(retrieval, `AI reranking runtime not found: ${runtimeId}`)
    }

    const project = deps.projectRegistry.getProject(request.projectId)
    if (!project) {
      return appendWarning(retrieval, `AI reranking project not found: ${request.projectId}`)
    }

    const rerankPool = retrieval.results.slice(0, Math.max(2, aiSettings.maxContextResults))
    const prompt = buildSearchRerankPrompt(request.query, rerankPool)
    const cwd = request.activeSessionId
      ? deps.sessionManager.getSession(request.activeSessionId)?.worktreePath ?? project.path
      : project.path
    const output = await deps.gitOps.aiGenerate(runtime.binary, prompt, cwd, runtime.aiModelArgs ?? [])
    const reranked = reorderResults(rerankPool, output)
    if (!reranked) {
      return appendWarning(retrieval, 'AI reranking did not return a usable order. Showing exact results.')
    }

    return {
      ...retrieval,
      results: [...reranked, ...retrieval.results.slice(rerankPool.length)],
    }
  } catch {
    return appendWarning(retrieval, 'AI reranking failed. Showing exact results.')
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
