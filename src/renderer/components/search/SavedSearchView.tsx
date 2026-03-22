import React from 'react'
import type { SearchHistoryEntry, SavedSearchEntry, SearchViewSnapshot } from '../../../shared/search-view-state'

interface SavedSearchViewProps {
  savedSearches: SavedSearchEntry[]
  recentSearches: SearchHistoryEntry[]
  currentSavedSearchId: string | null
  onApplyEntry: (entry: SearchHistoryEntry | SavedSearchEntry) => void
}

export function SavedSearchView(props: SavedSearchViewProps): React.JSX.Element {
  if (props.savedSearches.length === 0 && props.recentSearches.length === 0) {
    return <></>
  }

  return (
    <section style={styles.wrapper}>
      <div style={styles.header}>
        <span style={styles.title}>Pinned and Recent</span>
        <span style={styles.subtitle}>Reuse search workflows</span>
      </div>

      {props.savedSearches.length > 0 && (
        <SearchEntrySection
          title="Pinned"
          entries={props.savedSearches.slice(0, 4)}
          activeEntryId={props.currentSavedSearchId}
          onApplyEntry={props.onApplyEntry}
        />
      )}

      {props.recentSearches.length > 0 && (
        <SearchEntrySection
          title="Recent"
          entries={props.recentSearches.slice(0, 4)}
          activeEntryId={null}
          onApplyEntry={props.onApplyEntry}
        />
      )}
    </section>
  )
}

function SearchEntrySection({
  title,
  entries,
  activeEntryId,
  onApplyEntry,
}: {
  title: string
  entries: Array<SearchHistoryEntry | SavedSearchEntry>
  activeEntryId: string | null
  onApplyEntry: (entry: SearchHistoryEntry | SavedSearchEntry) => void
}): React.JSX.Element {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      <div style={styles.list}>
        {entries.map((entry) => (
          <button
            key={`${title}-${entry.id}`}
            type="button"
            style={{
              ...styles.entry,
              ...(activeEntryId === entry.id ? styles.entryActive : {}),
            }}
            onClick={() => onApplyEntry(entry)}
          >
            <span style={styles.entryLabel}>{entry.label}</span>
            <span style={styles.entryMeta}>
              {formatSnapshotMeta(entry.snapshot)}
              {typeof entry.resultCount === 'number' ? ` | ${entry.resultCount} results` : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function formatSnapshotMeta(snapshot: SearchViewSnapshot): string {
  const parts = [
    snapshot.mode === 'everything' ? 'Everything' : snapshot.mode === 'memory' ? 'Memory' : 'Code',
    snapshot.mode === 'memory'
      ? 'Project Memory'
      : snapshot.scopeKind === 'all-project-sessions'
        ? 'All Agents'
        : snapshot.scopeKind === 'visible-roots'
          ? 'Visible Roots'
          : 'Active Agent',
    snapshot.matchMode === 'regex' ? 'Regex' : 'Literal',
  ]

  if (snapshot.caseSensitive) parts.push('Case')
  if (snapshot.wholeWord) parts.push('Word')
  if (snapshot.memoryTypeFilter) parts.push(snapshot.memoryTypeFilter.replace(/_/g, ' '))
  if (snapshot.memoryConceptFilter) parts.push(snapshot.memoryConceptFilter)
  return parts.join(' | ')
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-sm)',
    marginTop: 'var(--space-lg)',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '2px',
  },
  title: {
    fontSize: 'var(--type-ui-caption)',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  subtitle: {
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-micro)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionTitle: {
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-micro)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  list: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  entry: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: '220px',
    maxWidth: '320px',
    padding: '8px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    textAlign: 'left',
    cursor: 'pointer',
  },
  entryActive: {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 1px var(--accent) inset',
  },
  entryLabel: {
    color: 'var(--text-primary)',
    fontSize: 'var(--type-ui-caption)',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  entryMeta: {
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-micro)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}
