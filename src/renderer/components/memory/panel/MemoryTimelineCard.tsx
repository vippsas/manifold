import React from 'react'
import type { MemoryTimelineItem } from '../../../../shared/memory-types'
import { memoryStyles as s } from '../MemoryPanel.styles'
import { formatMemoryTimestamp, MEMORY_SOURCE_LABELS, OBSERVATION_TYPE_LABELS } from './memory-panel-config'

interface MemoryTimelineCardProps {
  item: MemoryTimelineItem
  expanded: boolean
  onToggle: () => void
  onDelete?: () => void
}

export function MemoryTimelineCard({
  item,
  expanded,
  onToggle,
  onDelete,
}: MemoryTimelineCardProps): React.JSX.Element {
  return (
    <div style={s.card} onClick={onToggle}>
      <div style={s.cardHeader}>
        <span style={s.cardTitle}>{item.title}</span>
        <span style={s.typeBadge}>{OBSERVATION_TYPE_LABELS[item.type]}</span>
        <span style={s.sourceBadge}>{MEMORY_SOURCE_LABELS[item.source]}</span>
        {onDelete && (
          <button
            type="button"
            style={s.deleteButton}
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
            title="Delete"
          >
            x
          </button>
        )}
      </div>

      <div style={expanded ? { ...s.cardSummary, ...s.cardSummaryExpanded } : s.cardSummary}>
        {item.summary}
      </div>
      <div style={s.cardTimestamp}>{formatMemoryTimestamp(item.createdAt)}</div>

      {expanded && hasExpandedMetadata(item) && (
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
                {item.facts.map((fact, index) => (
                  <li key={index}>{fact}</li>
                ))}
              </ul>
            </>
          )}

          {item.source === 'observation' && item.concepts && item.concepts.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              {item.concepts.map((concept) => (
                <span key={concept} style={s.conceptTag}>{concept}</span>
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
                {item.decisionsMade.map((decision, index) => (
                  <li key={index}>{decision}</li>
                ))}
              </ul>
            </>
          )}

          {item.source === 'observation' && item.filesTouched.length > 0 && (
            <FileTagList label="Files touched:" files={item.filesTouched} />
          )}

          {item.source === 'session_summary' && item.filesChanged.length > 0 && (
            <FileTagList label="Files changed:" files={item.filesChanged} />
          )}
        </div>
      )}
    </div>
  )
}

function FileTagList({ label, files }: { label: string; files: string[] }): React.JSX.Element {
  return (
    <>
      <div style={s.filesLabel}>{label}</div>
      <div>
        {files.map((filePath) => (
          <span key={filePath} style={s.fileTag}>{filePath}</span>
        ))}
      </div>
    </>
  )
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
