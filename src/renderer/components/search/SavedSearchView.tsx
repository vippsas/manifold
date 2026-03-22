import React from 'react'
import type { SearchHistoryEntry, SavedSearchEntry, SearchViewSnapshot } from '../../../shared/search-view-state'

interface SavedSearchViewProps {
  savedSearches: SavedSearchEntry[]
  recentSearches: SearchHistoryEntry[]
  currentSavedSearchId: string | null
  onApplyEntry: (entry: SearchHistoryEntry | SavedSearchEntry) => void
  onToggleSaveCurrent: () => void
  hasCurrentSearch: boolean
}

export function SavedSearchView(props: SavedSearchViewProps): React.JSX.Element {
  return (
    <section style={styles.wrapper}>
      <div style={styles.header}>
        <span style={styles.title}>Search Workflow</span>
        <button
          type="button"
          style={styles.action}
          onClick={props.onToggleSaveCurrent}
          disabled={!props.hasCurrentSearch}
        >
          {props.currentSavedSearchId ? 'Unpin Search' : 'Pin Search'}
        </button>
      </div>

      {props.savedSearches.length > 0 && (
        <SearchEntrySection
          title="Pinned"
          entries={props.savedSearches}
          activeEntryId={props.currentSavedSearchId}
          onApplyEntry={props.onApplyEntry}
        />
      )}

      {props.recentSearches.length > 0 && (
        <SearchEntrySection
          title="Recent"
          entries={props.recentSearches}
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
    marginBottom: 'var(--space-md)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 'var(--space-sm)',
  },
  title: {
    fontSize: 'var(--type-ui-caption)',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  action: {
    minHeight: '22px',
    padding: '0 8px',
    fontSize: 'var(--type-ui-micro)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  sectionTitle: {
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-micro)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  entry: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '8px',
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
  },
  entryMeta: {
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-micro)',
  },
}
