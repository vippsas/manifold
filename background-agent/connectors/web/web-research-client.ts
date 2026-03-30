import type {
  WebResearchContext,
  WebResearchProgressEvent,
  WebResearchResult,
  WebResearchTopic,
} from './web-research-types'

export interface WebResearchClient {
  research(
    topics: WebResearchTopic[],
    context: WebResearchContext,
    onProgress?: (event: WebResearchProgressEvent) => void,
  ): Promise<WebResearchResult[]>
}

export class NoopWebResearchClient implements WebResearchClient {
  async research(
    _topics: WebResearchTopic[],
    _context: WebResearchContext,
    _onProgress?: (event: WebResearchProgressEvent) => void,
  ): Promise<WebResearchResult[]> {
    return []
  }
}
