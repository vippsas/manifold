// resources/plugins/manifold.watch/src/webview/components/WatchVideoCard.tsx
// Single-video card: metadata, the editable agent prompt, and the frame strip
// once the pipeline has produced thumbnails.
import React from 'react'
import type { WatchVideoInfo, WatchFrameRef } from '../../shared-types'
import { FrameThumbnailStrip } from './FrameThumbnailStrip'
import { watchVideoCardStyles as s } from '../styles/WatchVideoCard.styles'

interface Props {
  loading: boolean
  video: WatchVideoInfo | null
  question: string
  onQuestionChange: (value: string) => void
  improving: boolean
  canImprove: boolean
  onImprove: () => void
  frames: WatchFrameRef[]
  readFrame: (path: string) => Promise<string>
  onThumbLoaded: (path: string, dataUrl: string) => void
  onSelectFrame: (frameIndex: number) => void
}

export function WatchVideoCard(props: Props): React.JSX.Element | null {
  const { loading, video, question, improving, canImprove, frames } = props
  if (loading) {
    return (
      <div style={s.container}>
        <span style={s.loadingLabel}>
          <span style={s.spinner} aria-hidden />
          Loading…
        </span>
      </div>
    )
  }
  if (!video) return null

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.cardTop}>
          {video.thumbnailDataUrl ? (
            <img src={video.thumbnailDataUrl} alt="" style={s.thumb} />
          ) : (
            <div style={{ ...s.thumb, ...s.thumbFallback }}>🎬</div>
          )}
          <div style={s.meta}>
            <div style={s.title}>{video.title ?? 'Untitled video'}</div>
            <div style={s.subRow}>
              {video.uploader && <span>{video.uploader}</span>}
              {video.durationSeconds !== undefined && (
                <span style={s.duration}>{formatDuration(video.durationSeconds)}</span>
              )}
            </div>
          </div>
        </div>
        <div style={s.promptLabel}>Prompt sent to the agent</div>
        <div style={s.questionRow}>
          <textarea
            style={s.textarea}
            value={question}
            onChange={(e) => props.onQuestionChange(e.target.value)}
            placeholder="What should the agent look for in this video?"
            rows={3}
          />
          <button
            type="button"
            onClick={props.onImprove}
            disabled={!canImprove || improving || question.trim().length === 0}
            title="Improve this prompt with AI"
            style={{
              ...s.aiButton,
              ...(improving ? s.aiButtonImproving : {}),
              ...(!canImprove || question.trim().length === 0 ? s.aiButtonDisabled : {}),
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
        {frames.length > 0 && (
          <FrameThumbnailStrip
            frames={frames}
            readFrame={props.readFrame}
            onLoaded={props.onThumbLoaded}
            onSelect={(frame) => {
              const fi = frames.findIndex((f) => f.path === frame.path)
              if (fi >= 0) props.onSelectFrame(fi)
            }}
          />
        )}
      </div>
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
