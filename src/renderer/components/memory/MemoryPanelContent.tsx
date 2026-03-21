import React, { useState, useEffect, useCallback } from 'react'
import type { MemorySearchResult, MemoryTimelineItem, ObservationType } from '../../../shared/memory-types'
import type { UseMemoryResult } from '../../hooks/useMemory'
import { memoryStyles as s } from './MemoryPanel.styles'

const OBSERVATION_TYPES: ObservationType[] = [
  'task_summary',
  'decision',
  'error_resolution',
  'architecture',
  'pattern',
  'bugfix',
  'feature',
  'refactor',
  'discovery',
  'change',
]

const TYPE_LABELS: Record<ObservationType, string> = {
  task_summary: 'Summary',
  decision: 'Decision',
  error_resolution: 'Error Fix',
  architecture: 'Architecture',
  pattern: 'Pattern',
  bugfix: 'Bug Fix',
  feature: 'Feature',
  refactor: 'Refactor',
  discovery: 'Discovery',
  change: 'Change',
}

const OBSERVATION_CONCEPTS = [
  { value: 'how-it-works', label: 'How it works' },
  { value: 'what-changed', label: 'What changed' },
  { value: 'problem-solution', label: 'Problem/Solution' },
  { value: 'gotcha', label: 'Gotcha' },
  { value: 'pattern', label: 'Pattern' },
  { value: 'trade-off', label: 'Trade-off' },
  { value: 'why-it-exists', label: 'Why it exists' },
] as const

const SOURCE_LABELS: Record<MemoryTimelineItem['source'] | MemorySearchResult['source'], string> = {
  observation: 'Observation',
  session_summary: 'Session',
  interaction: 'Message',
}

function getCardSummaryStyle(expanded: boolean): React.CSSProperties {
  return expanded
    ? { ...s.cardSummary, ...s.cardSummaryExpanded }
    : s.cardSummary
}

function hasExpandedMetadata(item: MemoryTimelineItem): boolean {
  if (item.source === 'observation') {
    return item.facts.length > 0
      || item.filesTouched.length > 0
      || Boolean(item.narrative)
      || (item.concepts != null && item.concepts.length > 0)
  }

  if (item.source === 'session_summary') {
    return Boolean(item.whatWasLearned) || item.decisionsMade.length > 0 || item.filesChanged.length > 0
  }

  return false
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const conceptChipStyle: React.CSSProperties = {
  padding: '1px 6px',
  fontSize: '9px',
  borderRadius: '8px',
  border: '1px solid rgba(156, 39, 176, 0.3)',
  background: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
}

const conceptChipActiveStyle: React.CSSProperties = {
  ...conceptChipStyle,
  background: 'rgba(156, 39, 176, 0.2)',
  color: 'var(--text-primary)',
  borderColor: 'rgba(156, 39, 176, 0.6)',
}

const conceptTagStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '9px',
  padding: '1px 5px',
  marginRight: '3px',
  marginBottom: '2px',
  borderRadius: '3px',
  background: 'rgba(156, 39, 176, 0.1)',
  color: 'var(--text-muted)',
}

interface MemoryPanelContentProps {
  memory: UseMemoryResult
}

export function MemoryPanelContent({ memory }: MemoryPanelContentProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'search' | 'timeline'>('timeline')
  const [typeFilter, setTypeFilter] = useState<ObservationType | null>(null)
  const [conceptFilter, setConceptFilter] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    void memory.loadTimeline(true)
    void memory.loadStats()
  }, [memory.loadTimeline, memory.loadStats])

  const handleTabChange = useCallback((tab: 'search' | 'timeline') => {
    setActiveTab(tab)
    setExpandedId(null)
  }, [])

  const handleFilterClick = useCallback((type: ObservationType) => {
    setTypeFilter((prev) => {
      const newFilter = prev === type ? null : type
      if (memory.searchQuery) {
        void memory.search(memory.searchQuery, newFilter ?? undefined, conceptFilter ? [conceptFilter] : undefined)
      }
      return newFilter
    })
  }, [memory, conceptFilter])

  const handleConceptClick = useCallback((concept: string) => {
    setConceptFilter((prev) => {
      const newConcept = prev === concept ? null : concept
      // Reload timeline with concept filter
      void memory.loadTimeline(true, newConcept ? [newConcept] : undefined)
      if (memory.searchQuery) {
        void memory.search(memory.searchQuery, typeFilter ?? undefined, newConcept ? [newConcept] : undefined)
      }
      return newConcept
    })
  }, [memory, typeFilter])

  const handleLoadMore = useCallback(() => {
    void memory.loadTimeline(false, conceptFilter ? [conceptFilter] : undefined)
  }, [memory.loadTimeline, conceptFilter])

  const handleClear = useCallback(() => {
    if (confirm('Delete all memory for this project? This cannot be undone.')) {
      void memory.clearMemory()
    }
  }, [memory.clearMemory])

  const filteredTimeline = typeFilter
    ? memory.timeline.filter((o) => o.type === typeFilter)
    : memory.timeline

  const filteredSearch = typeFilter
    ? memory.searchResults.filter((r) => r.type === typeFilter)
    : memory.searchResults

  return (
    <div style={s.wrapper}>
      {/* Search bar */}
      <div style={s.searchBar}>
        <input
          type="text"
          placeholder="Search memory..."
          value={memory.searchQuery}
          onChange={(e) => {
            memory.setSearchQuery(e.target.value)
            if (e.target.value.trim()) setActiveTab('search')
          }}
          style={s.searchInput}
        />
      </div>

      {/* Tabs */}
      <div style={s.tabBar}>
        <button
          style={{ ...s.tab, ...(activeTab === 'search' ? s.tabActive : {}) }}
          onClick={() => handleTabChange('search')}
        >
          Search
        </button>
        <button
          style={{ ...s.tab, ...(activeTab === 'timeline' ? s.tabActive : {}) }}
          onClick={() => handleTabChange('timeline')}
        >
          Timeline
        </button>
      </div>

      {/* Type filter chips */}
      <div style={s.filterBar}>
        {OBSERVATION_TYPES.map((type) => (
          <button
            key={type}
            style={{ ...s.filterChip, ...(typeFilter === type ? s.filterChipActive : {}) }}
            onClick={() => handleFilterClick(type)}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {/* Concept filter chips */}
      <div style={{ ...s.filterBar, borderBottom: '1px solid var(--border)' }}>
        {OBSERVATION_CONCEPTS.map(({ value, label }) => (
          <button
            key={value}
            style={conceptFilter === value ? conceptChipActiveStyle : conceptChipStyle}
            onClick={() => handleConceptClick(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {memory.error && (
        <div style={s.errorBanner} title={memory.error}>
          {memory.error}
        </div>
      )}

      {/* Content */}
      <div style={s.content}>
        {activeTab === 'search' ? (
          memory.isSearching ? (
            <div style={s.emptyState}>Searching...</div>
          ) : filteredSearch.length > 0 ? (
            filteredSearch.map((result) => (
              <SearchResultCard
                key={result.id}
                result={result}
                expanded={expandedId === result.id}
                onToggle={() => setExpandedId(expandedId === result.id ? null : result.id)}
                onDelete={result.source === 'observation'
                  ? () => void memory.deleteObservation(result.id)
                  : undefined}
              />
            ))
          ) : memory.error ? (
            <div style={s.errorState}>{memory.error}</div>
          ) : memory.searchQuery ? (
            <div style={s.emptyState}>No results found</div>
          ) : (
            <div style={s.emptyState}>Type a query to search memory</div>
          )
        ) : filteredTimeline.length > 0 ? (
          <>
            {filteredTimeline.map((obs) => (
              <TimelineCard
                key={obs.id}
                item={obs}
                expanded={expandedId === obs.id}
                onToggle={() => setExpandedId(expandedId === obs.id ? null : obs.id)}
                onDelete={obs.source === 'observation'
                  ? () => void memory.deleteObservation(obs.id)
                  : undefined}
              />
            ))}
            {memory.timelineHasMore && (
              <button style={s.loadMoreButton} onClick={handleLoadMore}>
                Load more
              </button>
            )}
          </>
        ) : memory.error ? (
          <div style={s.errorState}>{memory.error}</div>
        ) : (
          <div style={s.emptyState}>
            No memory yet — observations will appear here as agents work
          </div>
        )}
      </div>

      {/* Stats bar */}
      {memory.stats && (
        <div style={s.statsBar}>
          <span>{memory.stats.totalInteractions} messages</span>
          <span>{memory.stats.totalObservations} observations</span>
          <span>{memory.stats.totalSessions} sessions</span>
          {memory.stats.oldestInteraction && (
            <span>since {formatTimestamp(memory.stats.oldestInteraction)}</span>
          )}
          <span style={{ marginLeft: 'auto' }}>
            <button style={s.clearButton} onClick={handleClear}>Clear</button>
          </span>
        </div>
      )}
    </div>
  )
}

function SearchResultCard({
  result,
  expanded,
  onToggle,
  onDelete,
}: {
  result: MemorySearchResult
  expanded: boolean
  onToggle: () => void
  onDelete?: () => void
}): React.JSX.Element {
  return (
    <div style={s.card} onClick={onToggle}>
      <div style={s.cardHeader}>
        <span style={s.cardTitle}>{result.title}</span>
        <span style={s.typeBadge}>{TYPE_LABELS[result.type]}</span>
        <span style={s.sourceBadge}>{SOURCE_LABELS[result.source]}</span>
        {onDelete && (
          <button style={s.deleteButton} onClick={(e) => { e.stopPropagation(); onDelete() }} title="Delete">
            x
          </button>
        )}
      </div>
      <div style={getCardSummaryStyle(expanded)}>{result.summary}</div>
      <div style={s.cardTimestamp}>{formatTimestamp(result.createdAt)}</div>
    </div>
  )
}

function TimelineCard({
  item,
  expanded,
  onToggle,
  onDelete,
}: {
  item: MemoryTimelineItem
  expanded: boolean
  onToggle: () => void
  onDelete?: () => void
}): React.JSX.Element {
  const showExpandedMetadata = hasExpandedMetadata(item)

  return (
    <div style={s.card} onClick={onToggle}>
      <div style={s.cardHeader}>
        <span style={s.cardTitle}>{item.title}</span>
        <span style={s.typeBadge}>{TYPE_LABELS[item.type]}</span>
        <span style={s.sourceBadge}>{SOURCE_LABELS[item.source]}</span>
        {onDelete && (
          <button style={s.deleteButton} onClick={(e) => { e.stopPropagation(); onDelete() }} title="Delete">
            x
          </button>
        )}
      </div>
      <div style={getCardSummaryStyle(expanded)}>{item.summary}</div>
      <div style={s.cardTimestamp}>{formatTimestamp(item.createdAt)}</div>
      {expanded && showExpandedMetadata && (
        <div style={s.expandedDetail}>
          {item.source === 'observation' && item.narrative && (
            <div style={s.detailBlock}>
              <strong>Context:</strong> {item.narrative}
            </div>
          )}
          {item.source === 'observation' && item.facts.length > 0 && (
            <>
              <div style={{ marginTop: '6px' }}><strong>Facts:</strong></div>
              <ul style={s.factsList}>
                {item.facts.map((fact, i) => (
                  <li key={i}>{fact}</li>
                ))}
              </ul>
            </>
          )}
          {item.source === 'observation' && item.concepts && item.concepts.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              {item.concepts.map((concept) => (
                <span key={concept} style={conceptTagStyle}>{concept}</span>
              ))}
            </div>
          )}
          {item.source === 'session_summary' && item.whatWasLearned && (
            <div style={s.detailBlock}>
              <strong>Learned:</strong> {item.whatWasLearned}
            </div>
          )}
          {item.source === 'session_summary' && item.decisionsMade.length > 0 && (
            <>
              <div style={s.detailBlock}><strong>Decisions:</strong></div>
              <ul style={s.factsList}>
                {item.decisionsMade.map((decision, i) => (
                  <li key={i}>{decision}</li>
                ))}
              </ul>
            </>
          )}
          {item.source === 'observation' && item.filesTouched.length > 0 && (
            <>
              <div style={s.filesLabel}>Files touched:</div>
              <div>
                {item.filesTouched.map((f) => (
                  <span key={f} style={s.fileTag}>{f}</span>
                ))}
              </div>
            </>
          )}
          {item.source === 'session_summary' && item.filesChanged.length > 0 && (
            <>
              <div style={s.filesLabel}>Files changed:</div>
              <div>
                {item.filesChanged.map((f) => (
                  <span key={f} style={s.fileTag}>{f}</span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
