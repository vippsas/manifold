export type NlBufferResult =
  | { type: 'accumulate' }
  | { type: 'passthrough' }
  | { type: 'nl-query'; query: string }

/**
 * Buffers keystrokes for a shell session and detects `# <text>` NL queries.
 * Call `feed()` with each chunk of input. When it returns `nl-query`, the
 * input should be intercepted (not forwarded to PTY). When it returns
 * `passthrough`, forward the entire buffered line + Enter to the PTY.
 */
export class NlInputBuffer {
  private buffer = ''

  feed(data: string): NlBufferResult {
    for (const char of data) {
      if (char === '\r' || char === '\n') {
        const line = this.buffer
        this.buffer = ''
        return this.classifyLine(line)
      }
      if (char === '\x7f') {
        // Backspace
        this.buffer = this.buffer.slice(0, -1)
        continue
      }
      if (char === '\x15') {
        // Ctrl+U: kill line
        this.buffer = ''
        continue
      }
      this.buffer += char
    }
    return { type: 'accumulate' }
  }

  private classifyLine(line: string): NlBufferResult {
    // Must start with "# " (hash + space) to trigger NL mode
    if (!line.startsWith('# ')) return { type: 'passthrough' }
    const query = line.slice(2).trim()
    if (!query) return { type: 'passthrough' }
    return { type: 'nl-query', query }
  }
}

/**
 * Strip ANSI/VT100 escape sequences from terminal output for AI context.
 * Simpler than the chat-adapter version — we just need readable text.
 */
export function stripAnsiForContext(text: string): string {
  return text
    // OSC sequences: ESC ] ... (ST | BEL)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // CSI sequences: ESC [ ... final byte
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    // Other escape sequences: ESC followed by one character
    .replace(/\x1b[^[\]]/g, '')
    // Remaining control characters except newline/tab
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
}

const DEFAULT_MAX_LINES = 50

/**
 * Rolling buffer that keeps the last N lines of plain-text terminal output.
 * ANSI sequences are stripped on append. Used to provide context to the AI
 * when translating natural language commands.
 */
export class RollingOutputBuffer {
  private lines: string[] = []
  private partial = ''

  constructor(private maxLines = DEFAULT_MAX_LINES) {}

  append(data: string): void {
    const clean = stripAnsiForContext(data)
    const text = this.partial + clean
    const parts = text.split('\n')
    // Last element is either empty (if data ended with \n) or a partial line
    this.partial = parts.pop() ?? ''

    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed) continue
      this.lines.push(trimmed)
    }

    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(-this.maxLines)
    }
  }

  getLines(): string[] {
    return [...this.lines]
  }

  getText(): string {
    return this.lines.join('\n')
  }
}
