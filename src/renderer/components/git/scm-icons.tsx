import React, { useState } from 'react'
import { sourceControlStyles as styles } from './SourceControl.styles'

export type ScmGlyphId = 'refresh' | 'check' | 'stage' | 'unstage' | 'discard' | 'list' | 'tree'

const GLYPH_PATHS: Record<ScmGlyphId, React.JSX.Element> = {
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-13.7-5.7L4 7.5" />
      <path d="M4 4v3.5H7.5" />
      <path d="M4 13a8 8 0 0 0 13.7 5.7L20 16.5" />
      <path d="M20 20v-3.5h-3.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  stage: <path d="M12 5v14M5 12h14" />,
  unstage: <path d="M5 12h14" />,
  discard: (
    <>
      <path d="M4 5v5h5" />
      <path d="M4.6 14a8 8 0 1 0 1.3-6.3L4 10" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
  tree: (
    <>
      <path d="M4 5h16" />
      <path d="M8 5v14" />
      <path d="M8 12h12M8 19h12" />
    </>
  ),
}

export function ScmGlyph({ id, size = 13 }: { id: ScmGlyphId; size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      {GLYPH_PATHS[id]}
    </svg>
  )
}

/** One Source Control action. Stops propagation so an action on a change row
 *  or a repo header never also triggers the row's open-the-diff click. */
export function ScmIconButton({
  glyph,
  label,
  onClick,
}: {
  glyph: ScmGlyphId
  label: string
  onClick: () => void
}): React.JSX.Element {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      style={{ ...styles.iconButton, ...(hover ? styles.iconButtonHover : undefined) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <ScmGlyph id={glyph} />
    </button>
  )
}
