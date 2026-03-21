import type { ToolUseEvent } from '../../shared/memory-types'

interface ToolPattern {
  toolName: string
  pattern: RegExp
  extractInput: (match: RegExpMatchArray) => string
}

// Claude Code PTY output patterns
const CLAUDE_PATTERNS: ToolPattern[] = [
  {
    toolName: 'Read',
    pattern: /⏺ Read\(([^)]+)\)|Read file:\s*(.+)/,
    extractInput: (m) => (m[1] || m[2]).trim(),
  },
  {
    toolName: 'Edit',
    pattern: /⏺ Edit\(([^)]+)\)|Edit file:\s*(.+)/,
    extractInput: (m) => (m[1] || m[2]).trim(),
  },
  {
    toolName: 'Write',
    pattern: /⏺ Write\(([^)]+)\)|Write file:\s*(.+)/,
    extractInput: (m) => (m[1] || m[2]).trim(),
  },
  {
    toolName: 'Bash',
    pattern: /⏺ Bash\(([^)]*)\)|Bash:\s*(.+)/,
    extractInput: (m) => (m[1] || m[2]).trim(),
  },
  {
    toolName: 'Search',
    pattern: /⏺ (?:Search|Grep|Glob)\(([^)]*)\)/,
    extractInput: (m) => m[1].trim(),
  },
]

// Gemini CLI PTY output patterns
const GEMINI_PATTERNS: ToolPattern[] = [
  {
    toolName: 'Read',
    pattern: /Reading file:\s*(.+)/,
    extractInput: (m) => m[1].trim(),
  },
  {
    toolName: 'Bash',
    pattern: /Running command:\s*(.+)/,
    extractInput: (m) => m[1].trim(),
  },
  {
    toolName: 'Tool',
    pattern: /Tool call:\s*(\w+)/,
    extractInput: (m) => m[1].trim(),
  },
]

const ALL_PATTERNS = [...CLAUDE_PATTERNS, ...GEMINI_PATTERNS]

export class ToolDetector {
  detect(text: string): ToolUseEvent[] {
    const events: ToolUseEvent[] = []
    const now = Date.now()
    const lines = text.split('\n')

    for (const line of lines) {
      for (const { toolName, pattern, extractInput } of ALL_PATTERNS) {
        const match = pattern.exec(line)
        if (match) {
          events.push({
            toolName,
            inputSummary: extractInput(match).slice(0, 200),
            timestamp: now,
          })
          break // one match per line
        }
      }
    }

    return events
  }
}
