import React from 'react'
import type { CodeSearchResult, SearchAskResponse, SearchMatchMode } from '../../../shared/search-types'
import { aiAnswerPanelStyles as s } from './AiAnswerPanel.styles'
import { SearchResultCard } from './SearchResultCard'

interface AiAnswerPanelProps {
  query: string
  response: SearchAskResponse | null
  isAsking: boolean
  error: string | null
  matchMode: SearchMatchMode
  caseSensitive: boolean
  wholeWord: boolean
  onOpenCodeResult: (result: CodeSearchResult) => void
}

export function AiAnswerPanel(props: AiAnswerPanelProps): React.JSX.Element | null {
  if (!props.isAsking && !props.error && !props.response) {
    return null
  }

  return (
    <section style={s.wrapper}>
      <div style={s.header}>
        <span style={s.title}>AI Answer</span>
        {props.response && <span style={s.meta}>{formatLatency(props.response.tookMs)}</span>}
      </div>

      {props.isAsking && (
        <div style={s.subtle}>Asking AI about "{props.query.trim()}"...</div>
      )}

      {props.error && (
        <div style={s.error}>{props.error}</div>
      )}

      {props.response && (
        <>
          <div style={s.answer}>{props.response.answer}</div>
          {props.response.citations.length > 0 && (
            <div style={s.citations}>
              <div style={s.citationsTitle}>Citations</div>
              {props.response.citations.map((citation) => (
                <SearchResultCard
                  key={`citation-${citation.id}`}
                  result={citation}
                  query={props.query}
                  matchMode={props.matchMode}
                  caseSensitive={props.caseSensitive}
                  wholeWord={props.wholeWord}
                  onOpenCodeResult={props.onOpenCodeResult}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function formatLatency(tookMs: number): string {
  if (tookMs < 1000) return `${tookMs} ms`
  return `${(tookMs / 1000).toFixed(1)} s`
}
