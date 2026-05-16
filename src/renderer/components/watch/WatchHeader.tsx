import React, { useState } from 'react'
import { watchStyles as s } from './WatchPanel.styles'

interface Props {
  url: string
  onUrlChange: (next: string) => void
  onRun: () => void
  canRun: boolean
  busy: boolean
  runLabel: string
  showExamples: boolean
}

/**
 * Hero + URL bar for the Watch panel. Combines the intro copy, the input,
 * and the inline Run button into one cohesive block, with optional example
 * chips shown only on the empty default state.
 */
export function WatchHeader({
  url, onUrlChange, onRun, canRun, busy, runLabel, showExamples,
}: Props): React.JSX.Element {
  const [focused, setFocused] = useState(false)
  return (
    <>
      <header style={s.hero}>
        <span style={s.heroIcon} aria-hidden>
          <span style={s.heroIconGlyph} />
        </span>
        <div style={s.heroCopy}>
          <div style={s.heroTitle}>Watch</div>
          <div style={s.heroSubtitle}>
            Paste a video, playlist, or local recording. Manifold extracts frames,
            transcribes audio, and spawns a sibling agent ready to answer questions
            about the content.
          </div>
        </div>
      </header>
      <div>
        <div style={{ ...s.inputBar, ...(focused ? s.inputBarFocused : {}) }}>
          <input
            style={s.inputInline}
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="https://youtu.be/… , a public playlist URL, or /path/to/recording.mp4"
            autoFocus
          />
          <button
            type="button"
            onClick={onRun}
            disabled={!canRun}
            aria-busy={busy}
            style={{
              ...s.runInline,
              ...(busy ? s.runInlineBusy : {}),
              ...(canRun || busy ? {} : s.runInlineDisabled),
            }}
          >
            {busy ? (
              <>
                <span style={s.runSpinner} aria-hidden />
                <span>Working…</span>
              </>
            ) : (
              runLabel
            )}
          </button>
        </div>
        <div style={s.inputHint}>Playlists must be public — private and unlisted are not supported.</div>
        {showExamples && (
          <div style={s.examples}>
            <span style={s.examplesLabel}>Try</span>
            <span style={s.exampleChip}>youtu.be/dQw4w9WgXcQ</span>
            <span style={s.exampleChip}>youtube.com/playlist?list=…</span>
            <span style={s.exampleChip}>/path/to/recording.mp4</span>
          </div>
        )}
      </div>
    </>
  )
}
