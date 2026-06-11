import React from 'react'

/**
 * The Manifold ghost as thin-stroke line art — an engraving rather than a
 * filled blob. Inherits its color from `currentColor` so callers set the
 * metal via `color` on a wrapper. Shared by the empty-state heroes.
 */
export function ManifoldGhost({ size = 84 }: { size?: number }): React.JSX.Element {
  return (
    <svg viewBox="0 0 1024 1024" width={size} height={size} aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={30}
        strokeLinejoin="round"
        strokeLinecap="round"
        d="M 512 180 C 340 180 260 310 260 440 L 260 700 Q 260 740 290 740 Q 320 710 350 740 Q 380 770 410 740 Q 440 710 470 740 Q 500 770 530 740 Q 560 710 590 740 Q 620 770 650 740 Q 680 710 710 740 Q 740 770 764 740 L 764 440 C 764 310 684 180 512 180 Z"
      />
      <circle cx="410" cy="440" r="34" fill="currentColor" />
      <circle cx="614" cy="440" r="34" fill="currentColor" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={26}
        strokeLinecap="round"
        d="M 430 540 Q 512 600 594 540"
      />
    </svg>
  )
}
