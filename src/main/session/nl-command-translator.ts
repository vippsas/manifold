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
