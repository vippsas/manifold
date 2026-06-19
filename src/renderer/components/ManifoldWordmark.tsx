import React from 'react'
import { ManifoldGhost } from './ManifoldGhost'

/**
 * The Manifold ghost glyph over a polished gold rule — the shared mark atop
 * every empty-state hero (first-run welcome, no-project, new-agent). `large`
 * is reserved for the very first screen; everything else uses `normal`.
 */
export function ManifoldWordmark({ size = 'normal' }: { size?: 'normal' | 'large' }): React.JSX.Element {
  const glyphSize = size === 'large' ? 88 : 64
  const ruleWidth = size === 'large' ? 72 : 48
  return (
    <div style={{ textAlign: 'center', color: 'var(--accent)' }} role="img" aria-label="Manifold">
      <ManifoldGhost size={glyphSize} />
      <div style={{
        width: ruleWidth,
        height: 2,
        borderRadius: 1,
        // Polished bar: yellow gold at the ends, white gold at the center.
        background: 'linear-gradient(90deg, var(--accent), var(--accent-hi, var(--accent-hover)), var(--accent))',
        margin: '12px auto 0',
      }} />
    </div>
  )
}
