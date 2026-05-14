import React from 'react'
import type { CSSProperties } from 'react'
import type { WatchPlaylistEntry } from '../../../shared/watch-types'

interface Props {
  entry: WatchPlaylistEntry | null
  onHide: () => void
}

export function WatchActivePlayer({ entry, onHide }: Props): React.JSX.Element | null {
  if (!entry) return null
  const videoId = getYoutubeVideoId(entry.url)
  if (!videoId) return null
  return (
    <div style={s.container}>
      <div style={s.aspectBox}>
        <iframe
          // `key` forces a fresh iframe when the video changes — without it,
          // YouTube's embed sometimes keeps the old player state.
          key={videoId}
          src={`https://www.youtube.com/embed/${videoId}`}
          title={entry.title ?? 'Video'}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={s.iframe}
        />
        <button
          type="button"
          onClick={onHide}
          title="Hide video player"
          aria-label="Hide video player"
          style={s.hideButton}
        >
          ×
        </button>
      </div>
      {entry.title && <div style={s.label}>{entry.title}</div>}
    </div>
  )
}

function getYoutubeVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.endsWith('youtu.be')) {
      const id = u.pathname.slice(1).split('/')[0]
      return id || null
    }
    if (u.hostname.endsWith('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return v
      const match = u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)
      if (match) return match[1]
    }
    return null
  } catch {
    return null
  }
}

const s: Record<string, CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  aspectBox: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 9',
    maxHeight: 320,
    borderRadius: 8,
    overflow: 'hidden',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
  },
  iframe: {
    position: 'absolute', inset: 0,
    width: '100%', height: '100%',
    border: 'none',
  },
  hideButton: {
    position: 'absolute', top: 6, right: 6,
    width: 24, height: 24, padding: 0,
    borderRadius: 4, border: 'none',
    background: 'rgba(0, 0, 0, 0.55)',
    color: 'white',
    fontSize: 16, lineHeight: '22px',
    cursor: 'pointer', zIndex: 2,
  },
  label: {
    fontSize: 11, opacity: 0.7, textAlign: 'center',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
}
