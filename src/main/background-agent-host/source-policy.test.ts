import { describe, expect, it } from 'vitest'
import { hasMinimumEvidence, isAllowedSource } from '../../../background-agent/core/research/source-policy'

describe('background-agent source policy', () => {
  it('allows high-signal official docs sources', () => {
    expect(isAllowedSource({
      title: 'Electron Release Notes',
      url: 'https://www.electronjs.org/blog/electron-35-0',
      type: 'official_docs',
    })).toBe(true)
  })

  it('rejects low-signal SEO-style titles even when labeled as engineering blogs', () => {
    expect(isAllowedSource({
      title: 'Top 10 Developer Tool Alternatives in 2026',
      url: 'https://example.com/blog/dev-tool-alternatives',
      type: 'engineering_blog',
    })).toBe(false)
  })

  it('rejects known review and comparison hosts', () => {
    expect(isAllowedSource({
      title: 'Product Comparison',
      url: 'https://www.g2.com/products/manifold/reviews',
      type: 'engineering_blog',
    })).toBe(false)
  })

  it('treats forums as acceptable supporting evidence when corroborated', () => {
    expect(hasMinimumEvidence([
      {
        id: 'official',
        title: 'Release Notes',
        url: 'https://example.com/docs/release',
        type: 'official_docs',
        trust: 'high',
        publishedAt: '2026-03-30',
      },
      {
        id: 'forum',
        title: 'Operator Discussion',
        url: 'https://forum.example.com/thread/123',
        type: 'forum',
        trust: 'low',
        publishedAt: '2026-03-29',
      },
    ])).toBe(true)
  })
})
