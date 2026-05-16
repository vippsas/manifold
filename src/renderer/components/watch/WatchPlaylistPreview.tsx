import React from 'react'
import type { CSSProperties } from 'react'
import type { WatchPlaylistEntry, WatchFrameRef } from '../../../shared/watch-types'
import { FrameThumbnailStrip } from './FrameThumbnailStrip'

interface Props {
  loading: boolean
  playlistTitle?: string
  uploader?: string
  entries: WatchPlaylistEntry[]
  questions: string[]
  selectedIndices: Set<number>
  improvingIndex: number | null
  onQuestionChange: (index: number, value: string) => void
  onImprove: (index: number) => void
  onToggleSelected: (index: number) => void
  onToggleAll: (selected: boolean) => void
  canImprove: boolean
  siblingByIndex: Record<number, string>
  focusedIndex: number | null
  onFocus: (index: number) => void
  framesByIndex: Record<number, WatchFrameRef[]>
  readFrame: (path: string) => Promise<string>
  onThumbLoaded: (path: string, dataUrl: string) => void
  onOpenSibling: (index: number) => void
  onSelectFrame: (cardIndex: number, frameIndex: number) => void
  /** Number of card columns. Defaults to 1; the panel passes 2 when the
   *  container is wide enough that single-column cards leave the right
   *  half of the screen empty. */
  columns?: number
}

export function WatchPlaylistPreview(props: Props): React.JSX.Element | null {
  const { loading, playlistTitle, uploader, entries, selectedIndices, columns = 1 } = props
  if (!loading && entries.length === 0) return null

  const isMultiEntry = entries.length > 1
  const allSelected = !loading && entries.length > 0 && selectedIndices.size === entries.length
  const someSelected = !loading && selectedIndices.size > 0 && !allSelected

  const useGrid = columns >= 2 && !loading && entries.length > 1
  const gridStyle: CSSProperties = useGrid
    ? { ...s.container, ...s.containerGrid, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
    : s.container

  return (
    <div style={gridStyle}>
      {(loading || isMultiEntry) && (
        <div style={{ ...s.header, ...(useGrid ? s.headerSpan : {}) }}>
          {loading ? (
            <span style={s.loadingLabel}>
              <span style={s.spinner} aria-hidden />
              Loading…
            </span>
          ) : (
            <>
              <label style={s.selectAllLabel}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected }}
                  onChange={(e) => props.onToggleAll(e.target.checked)}
                  style={s.checkbox}
                />
                <span style={s.headerTitle}>{playlistTitle ?? 'Playlist'}</span>
              </label>
              <span style={s.headerCount}>
                {selectedIndices.size} of {entries.length} selected{uploader ? ` · ${uploader}` : ''}
              </span>
            </>
          )}
        </div>
      )}
      {!loading && entries.map((entry, i) => (
        <PlaylistEntryCard
          key={`${entry.url}-${i}`}
          index={i}
          entry={entry}
          question={props.questions[i] ?? ''}
          selected={selectedIndices.has(i)}
          showCheckbox={isMultiEntry}
          showIndexLabel={isMultiEntry}
          improving={props.improvingIndex === i}
          improveDisabled={!props.canImprove || (props.improvingIndex !== null && props.improvingIndex !== i)}
          hasSibling={!!props.siblingByIndex[i]}
          frames={props.framesByIndex[i]}
          isActive={props.focusedIndex === i}
          readFrame={props.readFrame}
          onThumbLoaded={props.onThumbLoaded}
          onQuestionChange={props.onQuestionChange}
          onImprove={props.onImprove}
          onToggleSelected={props.onToggleSelected}
          onOpenSibling={props.onOpenSibling}
          onFocus={props.onFocus}
          onSelectFrame={props.onSelectFrame}
        />
      ))}
    </div>
  )
}

interface CardProps {
  index: number
  entry: WatchPlaylistEntry
  question: string
  selected: boolean
  showCheckbox: boolean
  showIndexLabel: boolean
  improving: boolean
  improveDisabled: boolean
  hasSibling: boolean
  frames?: WatchFrameRef[]
  isActive: boolean
  readFrame: (path: string) => Promise<string>
  onThumbLoaded: (path: string, dataUrl: string) => void
  onQuestionChange: (index: number, value: string) => void
  onImprove: (index: number) => void
  onToggleSelected: (index: number) => void
  onOpenSibling: (index: number) => void
  onFocus: (index: number) => void
  onSelectFrame: (cardIndex: number, frameIndex: number) => void
}

function PlaylistEntryCard({ index, entry, question, selected, showCheckbox, showIndexLabel, improving, improveDisabled, hasSibling, frames, isActive, readFrame, onThumbLoaded, onQuestionChange, onImprove, onToggleSelected, onOpenSibling, onFocus, onSelectFrame }: CardProps): React.JSX.Element {
  const focus = (): void => onFocus(index)
  return (
    <div
      style={{
        ...s.card,
        ...(selected ? {} : s.cardDeselected),
        ...(hasSibling ? s.cardClickable : {}),
        ...(isActive ? s.cardActive : {}),
      }}
    >
      <div style={s.cardTop}>
        {showCheckbox && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelected(index)}
            aria-label={`Include video #${index + 1} in run`}
            style={s.cardCheckbox}
          />
        )}
        {entry.thumbnailDataUrl ? (
          <img
            src={entry.thumbnailDataUrl}
            alt=""
            style={{ ...s.thumb, ...s.thumbClickable }}
            onClick={focus}
          />
        ) : (
          <div style={{ ...s.thumb, ...s.thumbFallback, ...s.thumbClickable }} onClick={focus}>🎬</div>
        )}
        <div style={s.meta}>
          {showIndexLabel && (
            <div style={s.indexLabel}>#{index + 1}</div>
          )}
          <div style={{ ...s.title, ...s.titleClickable }} onClick={focus}>
            {entry.title ?? 'Untitled video'}
          </div>
          <div style={s.subRow}>
            {entry.uploader && <span>{entry.uploader}</span>}
            {entry.durationSeconds !== undefined && (
              <span style={s.duration}>{formatDuration(entry.durationSeconds)}</span>
            )}
            {hasSibling && (
              <button
                type="button"
                onClick={() => onOpenSibling(index)}
                style={s.openAgentButton}
                title="Open the sibling agent for this video"
              >
                Open agent →
              </button>
            )}
          </div>
        </div>
      </div>
      <div style={s.questionRow}>
        <textarea
          style={s.textarea}
          value={question}
          onChange={(e) => onQuestionChange(index, e.target.value)}
          placeholder={hasSibling ? 'Question already sent to the agent (edit for re-run)' : 'Custom question (optional)'}
          rows={2}
        />
        <button
          type="button"
          onClick={() => onImprove(index)}
          disabled={improveDisabled || improving || question.trim().length === 0}
          title="Improve this prompt with AI"
          style={{
            ...s.aiButton,
            ...(improving ? s.aiButtonImproving : {}),
            ...((improveDisabled || question.trim().length === 0) && !improving ? s.aiButtonDisabled : {}),
          }}
        >
          {improving ? (
            <>
              <span style={s.aiSpinner} aria-hidden />
              <span>Improving…</span>
            </>
          ) : (
            'AI ✨'
          )}
        </button>
      </div>
      {frames && frames.length > 0 && (
        <div onClick={(e) => e.stopPropagation()}>
          <FrameThumbnailStrip
            frames={frames}
            readFrame={readFrame}
            onLoaded={onThumbLoaded}
            onSelect={(frame) => {
              const fi = frames.findIndex((f) => f.path === frame.path)
              if (fi >= 0) onSelectFrame(index, fi)
            }}
          />
        </div>
      )}
    </div>
  )
}

function formatDuration(total: number): string {
  const s = Math.max(0, Math.floor(total))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

const s: Record<string, CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: 8,
    flex: 1, minHeight: 0, overflowY: 'auto',
    // Symmetric padding so the active-card glow (box-shadow extending
    // outside the card) isn't clipped on the left edge by overflow:auto.
    padding: '2px 4px',
  },
  containerGrid: {
    display: 'grid', gap: 10,
    alignContent: 'start',
  },
  headerSpan: { gridColumn: '1 / -1' },
  header: {
    position: 'sticky', top: 0, zIndex: 1,
    background: 'var(--bg-default)',
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    padding: '4px 4px 6px', borderBottom: '1px solid var(--border-subtle)',
  },
  headerTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text-default)' },
  headerCount: { fontSize: 11, opacity: 0.65 },
  loadingLabel: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontSize: 12, color: 'var(--text-default)', opacity: 0.85,
  },
  spinner: {
    width: 12, height: 12,
    border: '2px solid var(--accent)',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  card: {
    display: 'flex', flexDirection: 'column', gap: 8,
    padding: 10, borderRadius: 8,
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    animation: 'watch-preview-in 220ms ease-out',
  },
  cardTop: { display: 'flex', gap: 10, alignItems: 'stretch' },
  thumb: {
    flex: '0 0 auto', width: 120, aspectRatio: '16 / 9',
    borderRadius: 6, objectFit: 'cover',
    background: 'var(--bg-default)', border: '1px solid var(--border-subtle)',
  },
  thumbFallback: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 24, opacity: 0.5,
  },
  thumbClickable: { cursor: 'pointer' },
  titleClickable: { cursor: 'pointer' },
  meta: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  indexLabel: { fontSize: 10, fontWeight: 600, opacity: 0.55, letterSpacing: 0.4 },
  cardDeselected: { opacity: 0.55 },
  cardClickable: { borderColor: 'var(--accent)' },
  openAgentButton: {
    marginLeft: 'auto',
    padding: '2px 8px', borderRadius: 4,
    border: '1px solid var(--accent)',
    background: 'transparent', color: 'var(--accent)',
    fontSize: 11, fontWeight: 600,
    cursor: 'pointer',
  },
  cardActive: {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 1px var(--accent), 0 0 12px var(--accent-subtle)',
    background: 'var(--accent-subtle)',
  },
  cardCheckbox: {
    width: 16, height: 16, margin: 0, flexShrink: 0, cursor: 'pointer',
    accentColor: 'var(--accent)', alignSelf: 'flex-start', marginTop: 2,
  },
  selectAllLabel: {
    display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
  },
  checkbox: {
    width: 14, height: 14, margin: 0, cursor: 'pointer',
    accentColor: 'var(--accent)',
  },
  title: {
    fontSize: 13, fontWeight: 600, lineHeight: 1.35,
    color: 'var(--text-default)',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
  },
  subRow: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, opacity: 0.75, flexWrap: 'wrap' },
  duration: {
    padding: '1px 6px', borderRadius: 3,
    background: 'var(--bg-default)', border: '1px solid var(--border-subtle)',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },
  questionRow: { display: 'flex', alignItems: 'flex-start', gap: 6 },
  textarea: {
    flex: 1, minHeight: 38, padding: '6px 8px', borderRadius: 4,
    background: 'var(--bg-default)', color: 'var(--text-default)',
    border: '1px solid var(--border-subtle)', fontSize: 12, outline: 'none',
    fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
  },
  aiButton: {
    flex: '0 0 auto',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 10px', borderRadius: 4,
    border: '1px solid var(--border-subtle)',
    background: 'transparent', color: 'var(--text-default)',
    fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
    cursor: 'pointer', lineHeight: 1.4, whiteSpace: 'nowrap',
  },
  aiButtonDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  aiButtonImproving: {
    opacity: 1,
    cursor: 'progress',
    borderColor: 'var(--accent)',
    color: 'var(--accent)',
    animation: 'ai-pulse 1.4s ease-in-out infinite',
  },
  aiSpinner: {
    width: 10, height: 10,
    border: '1.5px solid currentColor',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
}
