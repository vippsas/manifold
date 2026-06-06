import { describe, it, expect } from 'vitest'
import { buildGutterDecorations } from './useDiffGutter'

const DIFF = `diff --git a/x.ts b/x.ts
index 111..222 100644
--- a/x.ts
+++ b/x.ts
@@ -1,3 +1,4 @@
 unchanged
+added line
-removed line
+changed line
 tail
`

describe('buildGutterDecorations', () => {
  it('returns no decorations for empty diff', () => {
    expect(buildGutterDecorations(null)).toEqual([])
    expect(buildGutterDecorations('')).toEqual([])
  })

  it('maps added/modified/deleted ranges to gutter classes', () => {
    const decos = buildGutterDecorations(DIFF)
    const classes = decos.map((d) => d.className)
    expect(classes).toContain('editor-gutter--added')
    expect(classes).toContain('editor-gutter--modified')
    for (const d of decos) {
      expect(d.startLine).toBeGreaterThanOrEqual(1)
      expect(d.endLine).toBeGreaterThanOrEqual(d.startLine)
    }
  })

  it('maps a pure deletion to the deleted gutter class', () => {
    const DELETION = `diff --git a/y.ts b/y.ts
index 111..222 100644
--- a/y.ts
+++ b/y.ts
@@ -1,3 +1,2 @@
 keep
-gone
 tail
`
    const classes = buildGutterDecorations(DELETION).map((d) => d.className)
    expect(classes).toContain('editor-gutter--deleted')
  })
})
