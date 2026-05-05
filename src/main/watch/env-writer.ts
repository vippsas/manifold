import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { TranscriptionSettings } from '../../shared/watch-types'

export function writeWatchEnv(settings: TranscriptionSettings, homeDir: string = os.homedir()): void {
  const cfgDir = path.join(homeDir, '.config', 'watch')
  const cfgFile = path.join(cfgDir, '.env')
  fs.mkdirSync(cfgDir, { recursive: true })

  const lines: string[] = []
  if (settings.provider === 'openai' && settings.openaiApiKey) {
    lines.push(`OPENAI_API_KEY=${settings.openaiApiKey}`)
  }
  if (settings.provider === 'azure') {
    if (settings.azureApiKey) lines.push(`AZURE_OPENAI_API_KEY=${settings.azureApiKey}`)
    if (settings.azureEndpoint) lines.push(`AZURE_OPENAI_ENDPOINT=${settings.azureEndpoint}`)
    if (settings.azureDeployment) lines.push(`AZURE_OPENAI_DEPLOYMENT=${settings.azureDeployment}`)
  }
  const body = lines.length > 0 ? lines.join('\n') + '\n' : ''
  fs.writeFileSync(cfgFile, body, { mode: 0o600 })
  try { fs.chmodSync(cfgFile, 0o600) } catch { /* best effort on non-POSIX */ }
}
