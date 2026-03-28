import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./runtimes', () => ({
  getRuntimeById: vi.fn((id: string) => {
    const runtimes: Record<string, { id: string; waitingPattern?: string }> = {
      claude: {
        id: 'claude',
        waitingPattern: '❯|waiting for input|Interrupt to stop',
      },
      codex: {
        id: 'codex',
        waitingPattern: '> |codex>',
      },
      gemini: {
        id: 'gemini',
        waitingPattern: '❯|>>> ',
      },
    }
    return runtimes[id]
  }),
}))

import { detectStatus, detectVercelUrl, detectVercelDeployFailure } from './status-detector'

describe('detectStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Claude patterns', () => {
    it('detects waiting status from prompt character', () => {
      expect(detectStatus('some output\n❯ ', 'claude')).toBe('waiting')
    })

    it('detects waiting from "waiting for input"', () => {
      expect(detectStatus('Waiting for input...', 'claude')).toBe('waiting')
    })

    it('detects waiting from "Do you want to proceed"', () => {
      expect(detectStatus('Do you want to proceed?', 'claude')).toBe('waiting')
    })

    it('detects waiting from Allow/Deny prompt', () => {
      expect(detectStatus('Allow this action? Yes/No?', 'claude')).toBe('waiting')
    })

    it('detects running from "Interrupt to stop"', () => {
      expect(detectStatus('Processing... Interrupt to stop', 'claude')).toBe('running')
    })
  })

  describe('Codex patterns', () => {
    it('detects waiting from "> " prompt', () => {
      expect(detectStatus('ready\n> ', 'codex')).toBe('waiting')
    })

    it('detects waiting from "codex>" prompt', () => {
      expect(detectStatus('codex> ', 'codex')).toBe('waiting')
    })
  })

  describe('Gemini patterns', () => {
    it('detects waiting from prompt character', () => {
      expect(detectStatus('output\n❯ ', 'gemini')).toBe('waiting')
    })

    it('detects waiting from ">>> " prompt', () => {
      expect(detectStatus('output\n>>> ', 'gemini')).toBe('waiting')
    })
  })

  describe('error patterns (common)', () => {
    it('detects error from "Error:" pattern', () => {
      expect(detectStatus('Error: something went wrong', 'claude')).toBe('error')
    })

    it('detects error from "fatal:" pattern', () => {
      expect(detectStatus('fatal: not a git repository', 'claude')).toBe('error')
    })

    it('detects error from Python traceback', () => {
      expect(detectStatus('Traceback (most recent call last)', 'claude')).toBe('error')
    })

    it('detects error from "command not found"', () => {
      expect(detectStatus('sh: claude: command not found', 'codex')).toBe('error')
    })
  })

  describe('priority', () => {
    it('runtime-specific patterns take priority over error patterns', () => {
      // The waiting pattern should match before the error pattern
      // If output contains both a runtime-specific match and an error, the runtime-specific one wins
      const output = '❯ Error: something'
      expect(detectStatus(output, 'claude')).toBe('waiting')
    })
  })

  describe('running status', () => {
    it('returns running when output has content but no pattern match', () => {
      expect(detectStatus('processing data...', 'claude')).toBe('running')
    })

    it('returns running for empty output', () => {
      expect(detectStatus('', 'claude')).toBe('running')
    })

    it('returns running for whitespace-only output', () => {
      expect(detectStatus('   \n  ', 'claude')).toBe('running')
    })
  })

  describe('output truncation', () => {
    it('only examines the last 2000 characters', () => {
      // Put a waiting pattern beyond the 2000-char window
      const padding = 'x'.repeat(3000)
      const output = '❯ ' + padding
      // The ❯ is at the beginning, which is beyond the last 2000 chars
      expect(detectStatus(output, 'claude')).toBe('running')
    })

    it('detects patterns within the last 2000 characters', () => {
      const padding = 'x'.repeat(1000)
      const output = padding + '❯ '
      expect(detectStatus(output, 'claude')).toBe('waiting')
    })
  })
})

describe('detectVercelUrl', () => {
  it('returns null when no Vercel URL is present', () => {
    expect(detectVercelUrl('no urls here')).toBeNull()
  })

  it('returns the URL when only one is present', () => {
    expect(detectVercelUrl('Deployed to https://my-app.vercel.app')).toBe('https://my-app.vercel.app')
  })

  it('returns the shortest (production) URL when both deployment and production URLs are present', () => {
    const output = `
      Inspect: https://vercel.com/team/my-app/abc123
      Preview: https://my-app-8fk88lkx6-team.vercel.app
      Production: https://my-app.vercel.app
    `
    expect(detectVercelUrl(output)).toBe('https://my-app.vercel.app')
  })

  it('returns the production URL regardless of order', () => {
    const output = 'https://my-app.vercel.app then https://my-app-8fk88lkx6-team.vercel.app'
    expect(detectVercelUrl(output)).toBe('https://my-app.vercel.app')
  })
})

describe('detectVercelDeployFailure', () => {
  it('returns false when no failure is present', () => {
    expect(detectVercelDeployFailure('Deployed successfully')).toBe(false)
  })

  it('detects "Build failed"', () => {
    expect(detectVercelDeployFailure('Build failed')).toBe(true)
  })

  it('detects "vercel deploy failed"', () => {
    expect(detectVercelDeployFailure('vercel deploy has failed')).toBe(true)
  })
})
