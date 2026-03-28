import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VercelHealthCheck } from './vercel-health-check'

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    default: { ...actual, execFile: mockExecFile },
    execFile: mockExecFile,
  }
})

vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:util')>()
  return {
    ...actual,
    default: { ...actual, promisify: (fn: unknown) => fn },
    promisify: (fn: unknown) => fn,
  }
})

describe('VercelHealthCheck', () => {
  let healthCheck: VercelHealthCheck

  beforeEach(() => {
    healthCheck = new VercelHealthCheck()
    vi.clearAllMocks()
  })

  describe('isCliInstalled', () => {
    it('returns true when vercel --version succeeds', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'vercel 33.0.0', stderr: '' })
      expect(await healthCheck.isCliInstalled()).toBe(true)
    })

    it('returns false when vercel --version fails', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('command not found'))
      expect(await healthCheck.isCliInstalled()).toBe(false)
    })
  })

  describe('isAuthenticated', () => {
    it('returns true when vercel whoami succeeds', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'username', stderr: '' })
      expect(await healthCheck.isAuthenticated()).toBe(true)
    })

    it('returns false when vercel whoami fails', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('not authenticated'))
      expect(await healthCheck.isAuthenticated()).toBe(false)
    })
  })

  describe('installCli', () => {
    it('runs npm install -g vercel', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' })
      await healthCheck.installCli()
      expect(mockExecFile).toHaveBeenCalledWith('npm', ['install', '-g', 'vercel'], expect.any(Object))
    })

    it('throws on installation failure', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('EACCES'))
      await expect(healthCheck.installCli()).rejects.toThrow()
    })
  })

  describe('getHealthStatus', () => {
    it('returns ready when CLI installed and authenticated', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'vercel 33.0.0', stderr: '' })
      mockExecFile.mockResolvedValueOnce({ stdout: 'username', stderr: '' })
      const status = await healthCheck.getHealthStatus()
      expect(status).toEqual({ cliInstalled: true, authenticated: true })
    })

    it('returns not-installed when CLI missing', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('command not found'))
      const status = await healthCheck.getHealthStatus()
      expect(status).toEqual({ cliInstalled: false, authenticated: false })
    })

    it('returns not-authenticated when CLI present but not logged in', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'vercel 33.0.0', stderr: '' })
      mockExecFile.mockRejectedValueOnce(new Error('not authenticated'))
      const status = await healthCheck.getHealthStatus()
      expect(status).toEqual({ cliInstalled: true, authenticated: false })
    })
  })
})
