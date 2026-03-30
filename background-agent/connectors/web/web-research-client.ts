import type { WebResearchContext, WebResearchResult, WebResearchTopic } from './web-research-types'

export interface WebResearchClient {
  research(topics: WebResearchTopic[], context: WebResearchContext): Promise<WebResearchResult[]>
}

export class NoopWebResearchClient implements WebResearchClient {
  async research(_topics: WebResearchTopic[], _context: WebResearchContext): Promise<WebResearchResult[]> {
    return []
  }
}
