import { describe, it, expect } from 'vitest'
import { detectUrl } from './url-detector'

describe('detectUrl', () => {
  it('returns null for output without URLs', () => {
    expect(detectUrl('Hello world')).toBeNull()
  })

  it('detects http://localhost:3000', () => {
    const result = detectUrl('Server running at http://localhost:3000')
    expect(result).toEqual({ url: 'http://localhost:3000', port: 3000 })
  })

  it('detects http://127.0.0.1:5173', () => {
    const result = detectUrl('  ➜  Local:   http://127.0.0.1:5173/')
    expect(result).toEqual({ url: 'http://127.0.0.1:5173/', port: 5173 })
  })

  it('detects http://0.0.0.0:8080', () => {
    const result = detectUrl('Listening on http://0.0.0.0:8080')
    expect(result).toEqual({ url: 'http://0.0.0.0:8080', port: 8080 })
  })

  it('detects localhost URL without http prefix', () => {
    const result = detectUrl('Server started on localhost:4000')
    expect(result).toEqual({ url: 'http://localhost:4000', port: 4000 })
  })

  it('strips ANSI escape codes before matching', () => {
    const result = detectUrl('\x1b[32mhttp://localhost:3000\x1b[0m')
    expect(result).toEqual({ url: 'http://localhost:3000', port: 3000 })
  })

  it('strips cursor movement codes before matching', () => {
    const result = detectUrl('\x1b[1Chttp://localhost:3000')
    expect(result).toEqual({ url: 'http://localhost:3000', port: 3000 })
  })

  it('ignores port 9229 (Node debugger)', () => {
    expect(detectUrl('Debugger listening on ws://127.0.0.1:9229')).toBeNull()
  })
})
