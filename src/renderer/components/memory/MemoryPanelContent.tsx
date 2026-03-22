import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { ObservationType } from '../../../shared/memory-types'
import type { UseMemoryResult } from '../../hooks/useMemory'
import { memoryStyles as s } from './MemoryPanel.styles'
import { MemoryPanelBanner } from './panel/MemoryPanelBanner'
import { MemoryPanelFilters } from './panel/MemoryPanelFilters'
import { MemoryStatsBar } from './panel/MemoryStatsBar'
import { MemoryTimelineCard } from './panel/MemoryTimelineCard'

interface MemoryPanelContentProps {
  memory: UseMemoryResult
  onOpenSearch?: () => void
}

export function MemoryPanelContent({
  memory,
  onOpenSearch,
}: MemoryPanelContentProps): React.JSX.Element {
  const [typeFilter, setTypeFilter] = useState<ObservationType | null>(null)
  const [conceptFilter, setConceptFilter] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    void memory.loadTimeline(true)
    void memory.loadStats()
  }, [memory.loadStats, memory.loadTimeline])

  const handleToggleType = useCallback((type: ObservationType) => {
    setExpandedId(null)
    setTypeFilter((current) => (current === type ? null : type))
  }, [])

  const handleToggleConcept = useCallback((concept: string) => {
    setExpandedId(null)
    setConceptFilter((current) => {
      const nextConcept = current === concept ? null : concept
      void memory.loadTimeline(true, nextConcept ? [nextConcept] : undefined)
      return nextConcept
    })
  }, [memory])

  const handleLoadMore = useCallback(() => {
    void memory.loadTimeline(false, conceptFilter ? [conceptFilter] : undefined)
  }, [conceptFilter, memory])

  const handleClear = useCallback(() => {
    if (confirm('Delete all memory for this project? This cannot be undone.')) {
      void memory.clearMemory()
    }
  }, [memory])

  const filteredTimeline = useMemo(
    () => (typeFilter ? memory.timeline.filter((item) => item.type === typeFilter) : memory.timeline),
    [memory.timeline, typeFilter],
  )

  return (
    <div style={s.wrapper}>
      <MemoryPanelBanner onOpenSearch={onOpenSearch} />
      <MemoryPanelFilters
        typeFilter={typeFilter}
        conceptFilter={conceptFilter}
        onToggleType={handleToggleType}
        onToggleConcept={handleToggleConcept}
      />

      {memory.error && (
        <div style={s.errorBanner} title={memory.error}>
          {memory.error}
        </div>
      )}

      <div style={s.content}>
        {filteredTimeline.length > 0 ? (
          <>
            {filteredTimeline.map((item) => (
              <MemoryTimelineCard
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                onToggle={() => setExpandedId((current) => current === item.id ? null : item.id)}
                onDelete={item.source === 'observation'
                  ? () => void memory.deleteObservation(item.id)
                  : undefined}
              />
            ))}

            {memory.timelineHasMore && (
              <button type="button" style={s.loadMoreButton} onClick={handleLoadMore}>
                Load more
              </button>
            )}
          </>
        ) : memory.error ? (
          <div style={s.errorState}>{memory.error}</div>
        ) : (
          <div style={s.emptyState}>
            No memory yet. Observations and summaries will accumulate here as agents work.
          </div>
        )}
      </div>

      {memory.stats && <MemoryStatsBar stats={memory.stats} onClear={handleClear} />}
    </div>
  )
}
