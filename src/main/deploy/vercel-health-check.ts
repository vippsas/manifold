import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { VercelHealth } from '../../shared/simple-types'

const execFileAsync = promisify(execFile)

export class VercelHealthCheck {
  async isCliInstalled(): Promise<boolean> {
    try {
      await execFileAsync('vercel', ['--version'])
      return true
    } catch {
      return false
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('vercel', ['whoami'])
      return stdout.trim().length > 0
    } catch {
      return false
    }
  }

  async installCli(): Promise<void> {
    await execFileAsync('npm', ['install', '-g', 'vercel'], { timeout: 120_000 })
  }

  async login(): Promise<void> {
    await execFileAsync('vercel', ['login', '--github'], { timeout: 120_000 })
  }

  async getHealthStatus(): Promise<VercelHealth> {
    const cliInstalled = await this.isCliInstalled()
    if (!cliInstalled) {
      return { cliInstalled: false, authenticated: false }
    }
    const authenticated = await this.isAuthenticated()
    return { cliInstalled, authenticated }
  }
}
