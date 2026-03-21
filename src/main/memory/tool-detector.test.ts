import { describe, it, expect } from 'vitest'
import { ToolDetector } from './tool-detector'

const detector = new ToolDetector()

describe('ToolDetector', () => {
  describe('Claude Code patterns', () => {
    it('detects Read tool via unicode bullet', () => {
      const events = detector.detect('⏺ Read(src/main/index.ts)')
      expect(events).toHaveLength(1)
      expect(events[0].toolName).toBe('Read')
      expect(events[0].inputSummary).toBe('src/main/index.ts')
    })

    it('detects Edit tool via unicode bullet', () => {
      const events = detector.detect('⏺ Edit(src/main/memory/memory-store.ts)')
      expect(events).toHaveLength(1)
      expect(events[0].toolName).toBe('Edit')
      expect(events[0].inputSummary).toBe('src/main/memory/memory-store.ts')
    })

    it('detects Write tool via unicode bullet', () => {
      const events = detector.detect('⏺ Write(src/main/memory/tool-detector.ts)')
      expect(events).toHaveLength(1)
      expect(events[0].toolName).toBe('Write')
      expect(events[0].inputSummary).toBe('src/main/memory/tool-detector.ts')
    })

    it('detects Bash tool via unicode bullet', () => {
      const events = detector.detect('⏺ Bash(npm run test)')
      expect(events).toHaveLength(1)
      expect(events[0].toolName).toBe('Bash')
      expect(events[0].inputSummary).toBe('npm run test')
    })

    it('detects Search tool (Grep/Glob)', () => {
      const events = detector.detect('⏺ Grep(authentication)')
      expect(events).toHaveLength(1)
      expect(events[0].toolName).toBe('Search')
    })

    it('detects Read file: pattern', () => {
      const events = detector.detect('Read file: src/shared/types.ts')
      expect(events).toHaveLength(1)
      expect(events[0].toolName).toBe('Read')
      expect(events[0].inputSummary).toBe('src/shared/types.ts')
    })

    it('detects Bash: pattern', () => {
      const events = detector.detect('Bash: npm run typecheck')
      expect(events).toHaveLength(1)
      expect(events[0].toolName).toBe('Bash')
      expect(events[0].inputSummary).toBe('npm run typecheck')
    })
  })

  describe('Gemini CLI patterns', () => {
    it('detects Reading file pattern', () => {
      const events = detector.detect('Reading file: src/main/index.ts')
      expect(events).toHaveLength(1)
      expect(events[0].toolName).toBe('Read')
      expect(events[0].inputSummary).toBe('src/main/index.ts')
    })

    it('detects Running command pattern', () => {
      const events = detector.detect('Running command: npm test')
      expect(events).toHaveLength(1)
      expect(events[0].toolName).toBe('Bash')
      expect(events[0].inputSummary).toBe('npm test')
    })

    it('detects Tool call pattern', () => {
      const events = detector.detect('Tool call: SearchFiles')
      expect(events).toHaveLength(1)
      expect(events[0].toolName).toBe('Tool')
      expect(events[0].inputSummary).toBe('SearchFiles')
    })
  })

  describe('multi-line input', () => {
    it('detects multiple tools from multi-line output', () => {
      const text = [
        '⏺ Read(src/main/index.ts)',
        'Some output text here',
        '⏺ Edit(src/main/memory/memory-store.ts)',
        '⏺ Bash(npm run test)',
      ].join('\n')

      const events = detector.detect(text)
      expect(events).toHaveLength(3)
      expect(events[0].toolName).toBe('Read')
      expect(events[1].toolName).toBe('Edit')
      expect(events[2].toolName).toBe('Bash')
    })
  })

  describe('non-tool text', () => {
    it('returns empty array for plain text', () => {
      expect(detector.detect('Just some normal text output')).toEqual([])
    })

    it('returns empty array for empty string', () => {
      expect(detector.detect('')).toEqual([])
    })
  })

  describe('input truncation', () => {
    it('truncates long input summaries to 200 chars', () => {
      const longPath = 'a'.repeat(300)
      const events = detector.detect(`⏺ Read(${longPath})`)
      expect(events).toHaveLength(1)
      expect(events[0].inputSummary.length).toBe(200)
    })
  })
})
