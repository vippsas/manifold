import type { AiServiceSettings } from '../../shared/watch-types'

export const DEFAULT_CHAT_MODEL = 'gpt-5.1'
const AZURE_API_VERSION = '2024-06-01'
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions'
const MAX_SUMMARY_CHARS = 200
const TIMEOUT_MS = 10_000

const SYSTEM_PROMPT =
  "Summarize the user's prompt content in a single sentence (max 200 chars). " +
  'Focus on intent and constraints. Output only the summary, no preamble.'

function fallback(middle: string): string {
  return `[middle omitted — ${middle.length} chars]`
}

export async function summarizeMiddle(
  middle: string,
  settings: AiServiceSettings,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  try {
    if (settings.provider === 'none') return fallback(middle)
    if (settings.provider === 'openai') {
      const key = settings.openaiApiKey?.trim()
      if (!key) return fallback(middle)
      const summary = await postOpenAi(middle, key, settings.chatModel ?? DEFAULT_CHAT_MODEL, fetchImpl)
      return capSummary(summary)
    }
    if (settings.provider === 'azure') {
      const key = settings.azureApiKey?.trim()
      const endpoint = settings.azureEndpoint?.trim()
      const deployment = settings.azureChatDeployment?.trim()
      if (!key || !endpoint || !deployment) return fallback(middle)
      const summary = await postAzure(middle, key, endpoint, deployment, fetchImpl)
      return capSummary(summary)
    }
    return fallback(middle)
  } catch {
    return fallback(middle)
  }
}

async function postOpenAi(middle: string, apiKey: string, model: string, fetchImpl: typeof fetch): Promise<string> {
  const res = await withTimeout(
    fetchImpl(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: middle },
        ],
        temperature: 0,
      }),
    }),
    TIMEOUT_MS,
  )
  return readChatText(res)
}

async function postAzure(
  middle: string, apiKey: string, endpoint: string, deployment: string, fetchImpl: typeof fetch,
): Promise<string> {
  const base = endpoint.replace(/\/+$/, '')
  const url = `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${AZURE_API_VERSION}`
  const res = await withTimeout(
    fetchImpl(url, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: middle },
        ],
        temperature: 0,
      }),
    }),
    TIMEOUT_MS,
  )
  return readChatText(res)
}

async function readChatText(res: Response): Promise<string> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('empty completion')
  return text
}

function capSummary(text: string): string {
  return text.length <= MAX_SUMMARY_CHARS ? text : text.slice(0, MAX_SUMMARY_CHARS)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}
