const CURSOR_FORWARD = /\x1b\[\d*C/g
const ANSI_ESCAPE = /\x1b\[[0-9;]*[a-zA-Z]/g

const URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{1,5})\/?[^\s]*/
// Characters that commonly appear right after a URL due to markdown or punctuation
// but are not part of the URL itself (e.g. **http://localhost:5182/**)
const TRAILING_JUNK = /[*)\]}>,"']+$/
const BARE_LOCALHOST_PATTERN = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{1,5})/

const IGNORED_PORTS = new Set([9229])

export interface DetectedUrl {
  url: string
  port: number
}

export function detectUrl(output: string): DetectedUrl | null {
  const clean = output.replace(CURSOR_FORWARD, ' ').replace(ANSI_ESCAPE, '')

  const fullMatch = clean.match(URL_PATTERN)
  if (fullMatch) {
    const port = parseInt(fullMatch[1], 10)
    if (IGNORED_PORTS.has(port)) return null
    const url = fullMatch[0].replace(TRAILING_JUNK, '')
    return { url, port }
  }

  const bareMatch = clean.match(BARE_LOCALHOST_PATTERN)
  if (bareMatch) {
    const port = parseInt(bareMatch[1], 10)
    if (IGNORED_PORTS.has(port)) return null
    return { url: `http://${bareMatch[0]}`, port }
  }

  return null
}
