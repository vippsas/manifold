// resources/plugins/manifold.watch/src/webview/components/WatchPlaylistPreview.tsx
// Ported verbatim from src/renderer/components/watch/WatchPlaylistPreview.tsx.
import React from 'react'
import type { CSSProperties } from 'react'
import type { WatchPlaylistEntry, WatchFrameRef } from '../../shared-types'
import { FrameThumbnailStrip } from './FrameThumbnailStrip'
import { watchPlaylistPreviewStyles as s } from '../styles/WatchPlaylistPreview.styles'

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
