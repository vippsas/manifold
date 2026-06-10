import { describe, it, expect } from 'vitest'

// Mirror of the allowlist regex in window-factory.ts so we can unit-test it
// without instantiating BrowserWindow.
const isLocalhostUrl = (url: string): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/.test(url)

describe('webview localhost allowlist regex', () => {
  // --- legitimately allowed ---
  it('allows http://localhost', () => expect(isLocalhostUrl('http://localhost')).toBe(true))
  it('allows http://localhost/', () => expect(isLocalhostUrl('http://localhost/')).toBe(true))
  it('allows http://localhost:3000', () => expect(isLocalhostUrl('http://localhost:3000')).toBe(true))
  it('allows http://localhost:3000/', () => expect(isLocalhostUrl('http://localhost:3000/')).toBe(true))
  it('allows http://localhost:3000/path', () => expect(isLocalhostUrl('http://localhost:3000/path')).toBe(true))
  it('allows https://localhost:8080/app', () => expect(isLocalhostUrl('https://localhost:8080/app')).toBe(true))
  it('allows http://127.0.0.1', () => expect(isLocalhostUrl('http://127.0.0.1')).toBe(true))
  it('allows http://127.0.0.1:5173/', () => expect(isLocalhostUrl('http://127.0.0.1:5173/')).toBe(true))
  it('allows http://0.0.0.0:4000/', () => expect(isLocalhostUrl('http://0.0.0.0:4000/')).toBe(true))

  // --- bypass attempts that must be rejected ---
  it('rejects http://localhost.evil.com', () => expect(isLocalhostUrl('http://localhost.evil.com')).toBe(false))
  it('rejects http://127.0.0.1.evil.com', () => expect(isLocalhostUrl('http://127.0.0.1.evil.com')).toBe(false))
  it('rejects http://0.0.0.0.evil.com', () => expect(isLocalhostUrl('http://0.0.0.0.evil.com')).toBe(false))
  it('rejects http://localhost:3000.evil.com', () => expect(isLocalhostUrl('http://localhost:3000.evil.com')).toBe(false))
  it('rejects https://evil.com', () => expect(isLocalhostUrl('https://evil.com')).toBe(false))
  it('rejects empty string', () => expect(isLocalhostUrl('')).toBe(false))
})
