import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { TranscriptSegment, TranscriptSource } from './types'
import type { AiServiceSettings } from '../../shared/watch-types'

const execFileP = promisify(execFile)

const MODEL_NAME = 'gpt-4o-transcribe'
const AZURE_API_VERSION = '2024-06-01'
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions'

export class TranscriberError extends Error {}
export class MissingKeyError extends TranscriberError {}

export interface AudioExtractor {
  (videoPath: string, outPath: string): Promise<void>
}

export const defaultExtractAudio: AudioExtractor = async (videoPath, outPath) => {
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  try {
    await execFileP('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', videoPath,
      '-vn',
      '-acodec', 'libmp3lame',
      '-ar', '16000',
      '-ac', '1',
      '-b:a', '64k',
      outPath,
    ], { maxBuffer: 16 * 1024 * 1024 })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new TranscriberError('ffmpeg is not installed. Install with: brew install ffmpeg')
    }
    const stderr = (err as { stderr?: string }).stderr ?? ''
    throw new TranscriberError(`ffmpeg audio extraction failed: ${stderr.trim() || (err as Error).message}`)
  }
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    throw new TranscriberError('ffmpeg produced no audio — video may have no audio track')
  }
}

export interface TranscribeOptions {
  videoPath: string
  audioOutPath: string
  settings: AiServiceSettings
  fetchImpl?: typeof fetch
  extractAudio?: AudioExtractor
}

export interface TranscribeResult {
  segments: TranscriptSegment[]
  source: Exclude<TranscriptSource, 'captions' | 'none'>
}

export async function transcribeVideo(opts: TranscribeOptions): Promise<TranscribeResult> {
  const provider = opts.settings.provider
  if (provider === 'none') {
    throw new MissingKeyError('Transcription is disabled (provider=none).')
  }

  const fetchImpl = opts.fetchImpl ?? fetch
  const extractor = opts.extractAudio ?? defaultExtractAudio

  if (provider === 'openai') {
    const apiKey = opts.settings.openaiApiKey?.trim()
    if (!apiKey) throw new MissingKeyError('OpenAI API key is missing.')
    await extractor(opts.videoPath, opts.audioOutPath)
    const text = await postOpenAi(opts.audioOutPath, apiKey, fetchImpl)
    return { segments: textToSegments(text), source: 'openai' }
  }

  if (provider === 'azure') {
    const apiKey = opts.settings.azureApiKey?.trim()
    const endpoint = opts.settings.azureEndpoint?.trim()
    if (!apiKey) throw new MissingKeyError('Azure OpenAI API key is missing.')
    if (!endpoint) throw new MissingKeyError('Azure OpenAI endpoint is missing.')
    const deployment = opts.settings.azureDeployment?.trim() || MODEL_NAME
    await extractor(opts.videoPath, opts.audioOutPath)
    const text = await postAzure(opts.audioOutPath, apiKey, endpoint, deployment, fetchImpl)
    return { segments: textToSegments(text), source: 'azure' }
  }

  throw new TranscriberError(`Unsupported provider: ${String(provider)}`)
}

async function postOpenAi(audioPath: string, apiKey: string, fetchImpl: typeof fetch): Promise<string> {
  const body = await buildFormData(audioPath, { model: MODEL_NAME, response_format: 'json', temperature: '0' })
  const res = await fetchImpl(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  })
  return readTextResponse(res, 'OpenAI')
}

async function postAzure(
  audioPath: string,
  apiKey: string,
  endpoint: string,
  deployment: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const base = endpoint.replace(/\/+$/, '')
  const url = `${base}/openai/deployments/${encodeURIComponent(deployment)}/audio/transcriptions?api-version=${AZURE_API_VERSION}`
  const body = await buildFormData(audioPath, { response_format: 'json', temperature: '0' })
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'api-key': apiKey },
    body,
  })
  return readTextResponse(res, 'Azure OpenAI')
}

async function buildFormData(audioPath: string, fields: Record<string, string>): Promise<FormData> {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  const buffer = await fs.promises.readFile(audioPath)
  const blob = new Blob([new Uint8Array(buffer)], { type: 'audio/mpeg' })
  fd.append('file', blob, path.basename(audioPath))
  return fd
}

async function readTextResponse(res: Response, providerLabel: string): Promise<string> {
  if (!res.ok) {
    const detail = await safeReadText(res)
    throw new TranscriberError(
      `${providerLabel} transcription failed: HTTP ${res.status}${detail ? ` — ${detail.slice(0, 400)}` : ''}`,
    )
  }
  const data = (await res.json()) as { text?: string }
  const text = (data.text ?? '').trim()
  if (!text) throw new TranscriberError(`${providerLabel} returned empty transcript.`)
  return text
}

async function safeReadText(res: Response): Promise<string> {
  try { return await res.text() } catch { return '' }
}

// gpt-4o-transcribe doesn't return per-segment timestamps, only a single text
// blob. We surface it as one segment at t=0 so the rest of the pipeline (which
// expects segments) keeps working.
function textToSegments(text: string): TranscriptSegment[] {
  return [{ start: 0, end: 0, text }]
}
