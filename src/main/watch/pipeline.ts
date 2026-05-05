import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { download } from './downloader'
import { extractWithAutoFps, formatTime, getMetadata } from './frame-extractor'
import { filterRange, formatTranscript, parseVtt } from './vtt-parser'
import { transcribeVideo } from './transcriber'
import type { PipelineOptions, PipelineResult, TranscriptResult } from './types'
import type { TranscriptionSettings } from '../../shared/watch-types'

export interface PipelineHooks {
  onLog?: (line: string) => void
  onStage?: (stage: 'download' | 'frames' | 'transcribe' | 'report') => void
}

export async function runWatchPipeline(
  opts: PipelineOptions,
  transcription: TranscriptionSettings,
  hooks: PipelineHooks = {},
): Promise<PipelineResult> {
  const log = hooks.onLog ?? (() => {})
  const workDir = opts.workDir
    ? path.resolve(opts.workDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-watch-'))
  fs.mkdirSync(workDir, { recursive: true })

  const maxFrames = clampInt(opts.maxFrames ?? 80, 1, 100)
  const resolutionPx = opts.resolutionPx ?? 512

  hooks.onStage?.('download')
  log(`[watch] working dir: ${workDir}`)
  const dl = await download(opts.source, path.join(workDir, 'download'), { onLog: log })

  const meta = await getMetadata(dl.videoPath)
  const fullDuration = meta.durationSeconds

  const startSeconds = opts.startSeconds
  const endSeconds = opts.endSeconds

  if (startSeconds !== undefined && startSeconds < 0) {
    throw new Error('startSeconds must be non-negative')
  }
  if (endSeconds !== undefined && startSeconds !== undefined && endSeconds <= startSeconds) {
    throw new Error('endSeconds must be greater than startSeconds')
  }
  if (fullDuration > 0 && startSeconds !== undefined && startSeconds >= fullDuration) {
    throw new Error(`startSeconds ${startSeconds.toFixed(1)}s is past end of video (${fullDuration.toFixed(1)}s)`)
  }

  hooks.onStage?.('frames')
  const focused = startSeconds !== undefined || endSeconds !== undefined
  const effectiveStart = startSeconds ?? 0
  const effectiveEnd = endSeconds ?? fullDuration
  const effectiveDuration = Math.max(0, effectiveEnd - effectiveStart)

  const scope = focused
    ? `${formatTime(effectiveStart)}-${formatTime(effectiveEnd)} (${effectiveDuration.toFixed(1)}s)`
    : `full ${effectiveDuration.toFixed(1)}s`
  log(`[watch] extracting frames over ${scope}…`)

  const extraction = await extractWithAutoFps({
    videoPath: dl.videoPath,
    outDir: path.join(workDir, 'frames'),
    durationSeconds: fullDuration,
    startSeconds,
    endSeconds,
    maxFrames,
    resolutionPx,
    fpsOverride: opts.fpsOverride,
  })

  hooks.onStage?.('transcribe')
  let transcript: TranscriptResult = { segments: [], source: 'none' }

  if (dl.subtitlePath) {
    try {
      const all = parseVtt(dl.subtitlePath)
      const filtered = focused ? filterRange(all, startSeconds, endSeconds) : all
      transcript = { segments: filtered, source: 'captions' }
      log(`[watch] using native captions (${filtered.length} segments)`)
    } catch (err) {
      log(`[watch] subtitle parse failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (transcript.segments.length === 0 && transcription.provider !== 'none') {
    try {
      log(`[watch] transcribing audio via ${transcription.provider} (gpt-4o-transcribe)…`)
      const result = await transcribeVideo({
        videoPath: dl.videoPath,
        audioOutPath: path.join(workDir, 'audio.mp3'),
        settings: transcription,
      })
      transcript = { segments: result.segments, source: result.source }
      log(`[watch] transcribed ${result.segments.length} segment(s)`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log(`[watch] transcription failed: ${message}`)
    }
  }

  hooks.onStage?.('report')
  const report = renderReport({
    source: opts.source,
    info: dl.info,
    metadata: meta,
    fullDuration,
    focused,
    effectiveStart,
    effectiveEnd,
    effectiveDuration,
    fps: extraction.fps,
    target: extraction.target,
    maxFrames,
    resolutionPx,
    framesDir: path.join(workDir, 'frames'),
    frames: extraction.frames,
    transcript,
  })
  const reportPath = path.join(workDir, 'report.md')
  fs.writeFileSync(reportPath, report, 'utf-8')

  return {
    workDir,
    reportPath,
    framesDir: path.join(workDir, 'frames'),
    frames: extraction.frames,
    metadata: meta,
    transcript,
    fps: extraction.fps,
    focused,
    effectiveStart,
    effectiveEnd,
  }
}

interface ReportInputs {
  source: string
  info: { title?: string; uploader?: string; url?: string }
  metadata: { durationSeconds: number; width?: number; height?: number; codec?: string }
  fullDuration: number
  focused: boolean
  effectiveStart: number
  effectiveEnd: number
  effectiveDuration: number
  fps: number
  target: number
  maxFrames: number
  resolutionPx: number
  framesDir: string
  frames: Array<{ path: string; timestampSeconds: number }>
  transcript: TranscriptResult
}

function renderReport(r: ReportInputs): string {
  const lines: string[] = []
  lines.push('# watch: video report', '')
  lines.push(`- **Source:** ${r.source}`)
  if (r.info.title) lines.push(`- **Title:** ${r.info.title}`)
  if (r.info.uploader) lines.push(`- **Uploader:** ${r.info.uploader}`)
  lines.push(`- **Duration:** ${formatTime(r.fullDuration)} (${r.fullDuration.toFixed(1)}s)`)
  if (r.focused) {
    lines.push(
      `- **Focus range:** ${formatTime(r.effectiveStart)} → ${formatTime(r.effectiveEnd)} ` +
      `(${r.effectiveDuration.toFixed(1)}s)`,
    )
  }
  if (r.metadata.width && r.metadata.height) {
    lines.push(`- **Resolution:** ${r.metadata.width}x${r.metadata.height} (${r.metadata.codec ?? 'unknown codec'})`)
  }
  const mode = r.focused ? 'focused' : 'full'
  lines.push(
    `- **Frames:** ${r.frames.length} @ ${r.fps.toFixed(3)} fps, ${mode} mode ` +
    `(budget ${r.target}, max ${r.maxFrames})`,
  )
  lines.push(`- **Frame size:** ${r.resolutionPx}px wide`)
  if (r.transcript.segments.length > 0) {
    const inRange = r.focused ? ' in range' : ''
    lines.push(`- **Transcript:** ${r.transcript.segments.length} segment(s)${inRange} (via ${r.transcript.source})`)
  } else {
    lines.push('- **Transcript:** none available')
  }

  if (!r.focused && r.fullDuration > 600) {
    const mins = Math.floor(r.fullDuration / 60)
    lines.push('')
    lines.push(
      `> **Warning:** This is a ${mins}-minute video. Frame coverage is sparse at this length — ` +
      'accuracy degrades noticeably on anything over 10 minutes. For better results, ' +
      're-run with a focus range to zoom into a specific section.',
    )
  }

  lines.push('', '## Frames', '')
  lines.push(`Frames live at: \`${r.framesDir}\``, '')
  lines.push(
    '**Read each frame path below with the Read tool to view the image.** ' +
    'Frames are in chronological order; `t=MM:SS` is the absolute timestamp in the source video.',
    '',
  )
  for (const frame of r.frames) {
    lines.push(`- \`${frame.path}\` (t=${formatTime(frame.timestampSeconds)})`)
  }

  lines.push('', '## Transcript', '')
  if (r.transcript.segments.length > 0) {
    if (r.focused) {
      lines.push(
        `_Source: ${r.transcript.source}. Filtered to ${formatTime(r.effectiveStart)} → ${formatTime(r.effectiveEnd)}:_`,
      )
    } else {
      lines.push(`_Source: ${r.transcript.source}._`)
    }
    lines.push('', '```')
    lines.push(formatTranscript(r.transcript.segments))
    lines.push('```')
  } else {
    lines.push(
      '_No transcript available — proceed with frames only. ' +
      'Captions were missing and either no transcription provider is configured or it returned no text._',
    )
  }
  return lines.join('\n') + '\n'
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}
