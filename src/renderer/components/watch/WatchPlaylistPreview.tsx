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
  dispatched: boolean
  siblingByIndex: Record<number, string>
  framesByIndex: Record<number, WatchFrameRef[]>
  readFrame: (path: string) => Promise<string>
  onThumbLoaded: (path: string, dataUrl: string) => void
  onOpenSibling: (index: number) => void
  onSelectFrame: (cardIndex: number, frameIndex: number) => void
}

export function WatchPlaylistPreview(props: Props): React.JSX.Element | null {
  const { loading, playlistTitle, uploader, entries, selectedIndices } = props
  if (!loading && entries.length === 0) return null

  const isMultiEntry = entries.length > 1
  const allSelected = !loading && entries.length > 0 && selectedIndices.size === entries.length
  const someSelected = !loading && selectedIndices.size > 0 && !allSelected

  return (
    <div style={s.container}>
      {(loading || isMultiEntry) && (
        <div style={s.header}>
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
          dispatched={props.dispatched}
          hasSibling={!!props.siblingByIndex[i]}
          frames={props.framesByIndex[i]}
          readFrame={props.readFrame}
          onThumbLoaded={props.onThumbLoaded}
          onQuestionChange={props.onQuestionChange}
          onImprove={props.onImprove}
          onToggleSelected={props.onToggleSelected}
          onOpenSibling={props.onOpenSibling}
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
  dispatched: boolean
  hasSibling: boolean
  frames?: WatchFrameRef[]
  readFrame: (path: string) => Promise<string>
  onThumbLoaded: (path: string, dataUrl: string) => void
  onQuestionChange: (index: number, value: string) => void
  onImprove: (index: number) => void
  onToggleSelected: (index: number) => void
  onOpenSibling: (index: number) => void
  onSelectFrame: (cardIndex: number, frameIndex: number) => void
}

function PlaylistEntryCard({ index, entry, question, selected, showCheckbox, showIndexLabel, improving, improveDisabled, dispatched, hasSibling, frames, readFrame, onThumbLoaded, onQuestionChange, onImprove, onToggleSelected, onOpenSibling, onSelectFrame }: CardProps): React.JSX.Element {
  const clickable = dispatched && hasSibling
  const handleCardClick = clickable ? () => onOpenSibling(index) : undefined
  return (
    <div
      style={{
        ...s.card,
        ...(selected ? {} : s.cardDeselected),
        ...(clickable ? s.cardClickable : {}),
      }}
      onClick={handleCardClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable
        ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenSibling(index) } }
        : undefined}
    >
      <div style={s.cardTop}>
        {!dispatched && showCheckbox && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelected(index)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Include video #${index + 1} in run`}
            style={s.cardCheckbox}
          />
        )}
        {entry.thumbnailDataUrl ? (
          <img src={entry.thumbnailDataUrl} alt="" style={s.thumb} />
        ) : (
          <div style={{ ...s.thumb, ...s.thumbFallback }}>🎬</div>
        )}
        <div style={s.meta}>
          {(showIndexLabel || clickable) && (
            <div style={s.indexLabel}>
              {showIndexLabel ? `#${index + 1}` : ''}
              {showIndexLabel && clickable ? ' · ' : ''}
              {clickable ? 'click to open agent →' : ''}
            </div>
          )}
          <div style={s.title}>{entry.title ?? 'Untitled video'}</div>
          <div style={s.subRow}>
            {entry.uploader && <span>{entry.uploader}</span>}
            {entry.durationSeconds !== undefined && (
              <span style={s.duration}>{formatDuration(entry.durationSeconds)}</span>
            )}
          </div>
        </div>
      </div>
      {!dispatched && (
      <div style={s.questionRow} onClick={(e) => e.stopPropagation()}>
        <textarea
          style={s.textarea}
          value={question}
          onChange={(e) => onQuestionChange(index, e.target.value)}
          placeholder="Custom question (optional)"
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
      )}
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
    paddingRight: 4,
  },
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
  meta: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  indexLabel: { fontSize: 10, fontWeight: 600, opacity: 0.55, letterSpacing: 0.4 },
  cardDeselected: { opacity: 0.55 },
  cardClickable: { cursor: 'pointer', borderColor: 'var(--accent)' },
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
