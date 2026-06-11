import React from 'react'

// A designed constellation, not a random scatter — deterministic so every
// launch looks identical. [x%, y%, size(px), tint strength 0–1]
const STARS: Array<[number, number, number, number]> = [
  [8, 18, 1, 0.7], [16, 62, 1, 0.35], [23, 34, 1.5, 0.5], [31, 11, 1, 0.6],
  [38, 71, 1, 0.3], [47, 26, 1, 0.8], [54, 55, 1.5, 0.4], [61, 9, 1, 0.5],
  [68, 38, 1, 0.65], [74, 66, 1, 0.3], [81, 21, 1.5, 0.55], [88, 47, 1, 0.7],
  [93, 12, 1, 0.4], [12, 44, 1, 0.45], [85, 74, 1, 0.35],
]

const starLayers = STARS.map(([x, y, size, strength]) =>
  `radial-gradient(${size}px ${size}px at ${x}% ${y}%, color-mix(in srgb, var(--star-tint, var(--text-muted)) ${Math.round(strength * 100)}%, transparent) 50%, transparent 50%)`
).join(', ')

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  stars: {
    position: 'absolute',
    inset: 0,
    backgroundImage: starLayers,
  },
  horizon: {
    position: 'absolute',
    left: '-20%',
    right: '-20%',
    bottom: 0,
    height: '38%',
    backgroundImage: [
      'repeating-linear-gradient(90deg, var(--grid-tint, transparent) 0 1px, transparent 1px 64px)',
      'repeating-linear-gradient(0deg, var(--grid-tint, transparent) 0 1px, transparent 1px 28px)',
    ].join(', '),
    transform: 'perspective(420px) rotateX(58deg)',
    transformOrigin: 'bottom center',
    maskImage: 'linear-gradient(180deg, transparent, black 78%)',
    WebkitMaskImage: 'linear-gradient(180deg, transparent, black 78%)',
  },
}

/**
 * Whisper-level starfield + perspective horizon grid behind empty-state
 * heroes. Pure decoration: aria-hidden, pointer-events: none, static.
 */
export function StarfieldBackdrop(): React.JSX.Element {
  return (
    <div aria-hidden="true" data-testid="starfield-backdrop" style={styles.root}>
      <div style={styles.stars} />
      <div style={styles.horizon} />
    </div>
  )
}
