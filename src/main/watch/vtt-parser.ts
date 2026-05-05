import * as fs from 'node:fs'
import type { TranscriptSegment } from './types'

const TS_RE = /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/
const TAG_RE = /<[^>]+>/g

function toSeconds(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000
}

export function parseVtt(filePath: string): TranscriptSegment[] {
  const text = fs.readFileSync(filePath, 'utf-8')
  const lines = text.split(/\r?\n/)
  const segments: TranscriptSegment[] = []
  let i = 0
  while (i < lines.length) {
    const match = TS_RE.exec(lines[i])
    if (!match) { i += 1; continue }
    const start = toSeconds(match[1], match[2], match[3], match[4])
    const end = toSeconds(match[5], match[6], match[7], match[8])
    i += 1
    const cueLines: string[] = []
    while (i < lines.length && lines[i].trim() !== '') {
      const cleaned = lines[i].replace(TAG_RE, '').trim()
      if (cleaned) cueLines.push(cleaned)
      i += 1
    }
    const cueText = cueLines.join(' ').trim()
    if (cueText) segments.push({ start: round2(start), end: round2(end), text: cueText })
    i += 1
  }
  return dedupe(segments)
}

function dedupe(segments: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = []
  for (const seg of segments) {
    const last = out[out.length - 1]
    if (last && seg.text === last.text) {
      last.end = seg.end
      continue
    }
    if (last && seg.text.startsWith(last.text + ' ')) {
      last.text = seg.text
      last.end = seg.end
      continue
    }
    out.push({ ...seg })
  }
  return out
}

export function filterRange(
  segments: TranscriptSegment[],
  start: number | undefined,
  end: number | undefined,
): TranscriptSegment[] {
  if (start === undefined && end === undefined) return segments
  const lo = start ?? -Infinity
  const hi = end ?? Infinity
  return segments.filter((s) => s.end >= lo && s.start <= hi)
}

export function formatTranscript(segments: TranscriptSegment[]): string {
  const lines: string[] = []
  for (const seg of segments) {
    const start = Math.floor(seg.start)
    const stamp = `[${pad2(Math.floor(start / 60))}:${pad2(start % 60)}]`
    lines.push(`${stamp} ${seg.text}`)
  }
  return lines.join('\n')
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
function pad2(n: number): string { return n.toString().padStart(2, '0') }
