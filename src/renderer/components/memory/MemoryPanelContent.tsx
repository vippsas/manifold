import React, { useState, useEffect, useCallback } from 'react'
import type { MemorySearchResult, MemoryObservation, ObservationType } from '../../../shared/memory-types'
import type { UseMemoryResult } from '../../hooks/useMemory'
import { memoryStyles as s } from './MemoryPanel.styles'

const OBSERVATION_TYPES: ObservationType[] = [
  'task_summary',
  'decision',
  'error_resolution',
  'architecture',
  'pattern',
]

const TYPE_LABELS: Record<ObservationType, string> = {
  task_summary: 'Summary',
  decision: 'Decision',
  error_resolution: 'Error Fix',
  architecture: 'Architecture',
  pattern: 'Pattern',
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

interface MemoryPanelContentProps {
  memory: UseMemoryResult
}

export function MemoryPanelContent({ memory }: MemoryPanelContentProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'search' | 'timeline'>('timeline')
  const [typeFilter, setTypeFilter] = useState<ObservationType | null>(null)
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
        void memory.search(memory.searchQuery, newFilter ?? undefined)
      }
      return newFilter
    })
  }, [memory])

  const handleLoadMore = useCallback(() => {
    void memory.loadTimeline(false)
  }, [memory.loadTimeline])

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

      {/* Filter chips */}
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
                onDelete={() => void memory.deleteObservation(result.id)}
              />
            ))
          ) : memory.searchQuery ? (
            <div style={s.emptyState}>No results found</div>
          ) : (
            <div style={s.emptyState}>Type a query to search memory</div>
          )
        ) : filteredTimeline.length > 0 ? (
          <>
            {filteredTimeline.map((obs) => (
              <ObservationCard
                key={obs.id}
                observation={obs}
                expanded={expandedId === obs.id}
                onToggle={() => setExpandedId(expandedId === obs.id ? null : obs.id)}
                onDelete={() => void memory.deleteObservation(obs.id)}
              />
            ))}
            {memory.timelineHasMore && (
              <button style={s.loadMoreButton} onClick={handleLoadMore}>
                Load more
              </button>
            )}
          </>
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
  onDelete: () => void
}): React.JSX.Element {
  return (
    <div style={s.card} onClick={onToggle}>
      <div style={s.cardHeader}>
        <span style={s.cardTitle}>{result.title}</span>
        <span style={s.typeBadge}>{TYPE_LABELS[result.type]}</span>
        <button style={s.deleteButton} onClick={(e) => { e.stopPropagation(); onDelete() }} title="Delete">
          x
        </button>
      </div>
      <div style={s.cardSummary}>{result.summary}</div>
      <div style={s.cardTimestamp}>{formatTimestamp(result.createdAt)}</div>
    </div>
  )
}

function ObservationCard({
  observation,
  expanded,
  onToggle,
  onDelete,
}: {
  observation: MemoryObservation
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <div style={s.card} onClick={onToggle}>
      <div style={s.cardHeader}>
        <span style={s.cardTitle}>{observation.title}</span>
        <span style={s.typeBadge}>{TYPE_LABELS[observation.type]}</span>
        <button style={s.deleteButton} onClick={(e) => { e.stopPropagation(); onDelete() }} title="Delete">
          x
        </button>
      </div>
      <div style={s.cardSummary}>{observation.summary}</div>
      <div style={s.cardTimestamp}>{formatTimestamp(observation.createdAt)}</div>
      {expanded && (
        <div style={s.expandedDetail}>
          <div><strong>Summary:</strong> {observation.summary}</div>
          {observation.facts.length > 0 && (
            <>
              <div style={{ marginTop: '6px' }}><strong>Facts:</strong></div>
              <ul style={s.factsList}>
                {observation.facts.map((fact, i) => (
                  <li key={i}>{fact}</li>
                ))}
              </ul>
            </>
          )}
          {observation.filesTouched.length > 0 && (
            <>
              <div style={s.filesLabel}>Files touched:</div>
              <div>
                {observation.filesTouched.map((f) => (
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
