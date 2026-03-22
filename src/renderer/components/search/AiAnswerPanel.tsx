import React from 'react'
import type { CodeSearchResult, SearchAskResponse, SearchMatchMode } from '../../../shared/search-types'
import { aiAnswerPanelStyles as s } from './AiAnswerPanel.styles'
import { SearchResultCard } from './SearchResultCard'

const THINKING_PHRASES = [
  'Thinking',
  'Pondering',
  'Reasoning',
  'Connecting dots',
  'Weaving ideas',
  'Exploring paths',
  'Working through it',
  'Diving deep',
  'Piecing it together',
  'Mulling it over',
  'Crafting a response',
  'Mapping it out',
  'Almost there',
  'On it',
]

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
        <div style={s.headerText}>
          <span style={s.title}>AI Answer</span>
          {props.response && (
            <span style={s.sourceMeta}>
              {props.response.citations.length} grounded source{props.response.citations.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {props.response && <span style={s.meta}>{formatLatency(props.response.tookMs)}</span>}
      </div>

      {props.isAsking && (
        <AiAnswerLoadingIndicator query={props.query} />
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

function AiAnswerLoadingIndicator({ query }: { query: string }): React.JSX.Element {
  const [phrase, setPhrase] = React.useState(() =>
    THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)] ?? 'Thinking'
  )
  const [visible, setVisible] = React.useState(true)

  React.useEffect(() => {
    const id = window.setInterval(() => {
      setVisible(false)
      window.setTimeout(() => {
        setPhrase((prev) => pickRandomThinkingPhrase(prev))
        setVisible(true)
      }, 400)
    }, 3000)
    return () => window.clearInterval(id)
  }, [])

  const normalizedQuery = query.trim()

  return (
    <div style={s.loadingBlock}>
      <div style={s.loadingHeader}>
        <div style={s.loadingDots} aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="ai-answer-loading-dot"
              style={{ ...s.loadingDot, animationDelay: `${index * 0.2}s` }}
            />
          ))}
        </div>
        <span
          className="ai-answer-loading-text"
          style={{
            ...s.loadingText,
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}
        >
          {phrase}...
        </span>
      </div>
      <div style={s.loadingCaption}>
        {normalizedQuery ? `Asking AI about "${normalizedQuery}"...` : 'Asking AI...'}
      </div>
    </div>
  )
}

function pickRandomThinkingPhrase(exclude: string): string {
  const filtered = THINKING_PHRASES.filter((phrase) => phrase !== exclude)
  return filtered[Math.floor(Math.random() * filtered.length)] ?? THINKING_PHRASES[0] ?? 'Thinking'
}
