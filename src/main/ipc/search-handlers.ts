import { ipcMain } from 'electron'
import type { ProjectSearchViewState } from '../../shared/search-view-state'
import type { SearchAskRequest, SearchAskResponse, SearchContextResponse, SearchQueryRequest, SearchQueryResponse } from '../../shared/search-types'
import { getSearchContext } from '../search/search-context-service'
import { answerSearchQuestion } from '../search/ai-search-service'
import { executeSearchQuery } from '../search/search-query-service'
import type { IpcDependencies } from './types'

export function registerSearchHandlers(deps: IpcDependencies): void {
  const { sessionManager, memoryStore, settingsStore, projectRegistry, gitOps, searchViewStore } = deps

  ipcMain.handle('search:context', async (_event, projectId: string, activeSessionId: string | null): Promise<SearchContextResponse> => {
    return getSearchContext(sessionManager, projectId, activeSessionId)
  })

  ipcMain.handle('search:view-state:get', (_event, projectId: string): ProjectSearchViewState => {
    return searchViewStore.get(projectId)
  })

  ipcMain.handle('search:view-state:set', (_event, projectId: string, viewState: ProjectSearchViewState): void => {
    searchViewStore.set(projectId, viewState)
  })

  ipcMain.handle('search:query', async (_event, request: SearchQueryRequest): Promise<SearchQueryResponse> => {
    return executeSearchQuery({ sessionManager, memoryStore }, request)
  })

  ipcMain.handle('search:ask', async (_event, request: SearchAskRequest): Promise<SearchAskResponse> => {
    const normalizedRequest = {
      ...request,
      question: request.question.trim() || request.search.query,
    }
    const retrieval = await executeSearchQuery({ sessionManager, memoryStore }, normalizedRequest.search)
    return answerSearchQuestion(
      { settingsStore, projectRegistry, sessionManager, gitOps },
      normalizedRequest,
      retrieval,
    )
  })
}
