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

import { detectStatus, hasCodexInteractivePrompt } from './status-detector'

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

    it('detects waiting from the interactive Codex prompt line', () => {
      const output = [
        '› Write tests for @filename gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund • Working (47s • esc to interrupt)',
        '• Updated research/20260607-120639-boris-loops-codex-workflows/linkedin-article.md.',
        'No tests or benchmarks run, per instruction.',
        '─────────────────────────────────────────────────────────────────────',
        '› Write tests for @filename gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund',
      ].join('\n')
      expect(detectStatus(output, 'codex')).toBe('waiting')
    })

    it('detects waiting when long final output pushes the working marker out of range', () => {
      const output = [
        '› Write tests for @filename gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund • Working (47s • esc to interrupt)',
        'Completed work.\n'.repeat(250),
        '─────────────────────────────────────────────────────────────────────',
        '› Write tests for @filename gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund',
      ].join('\n')
      expect(detectStatus(output, 'codex')).toBe('waiting')
    })

    it('detects waiting when the Codex prompt metadata wraps onto the final line', () => {
      const output = [
        '• Updated research/20260607-120639-boris-loops-codex-workflows/linkedin-article.md.',
        'Conversation interrupted — tell the model what to do differently.',
        '› Use /skills to list available skills',
        '',
        'gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund',
      ].join('\n')
      expect(detectStatus(output, 'codex')).toBe('waiting')
    })

    it('does not treat the Codex working line as waiting', () => {
      const output = '› Write tests for @filename gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund • Working (42s • esc to interrupt)'
      expect(detectStatus(output, 'codex')).toBe('running')
    })

    it('keeps strict status running when stale working text contaminates the prompt tail', () => {
      const output = [
        '• Done. Changed only research/20260607-120639-boris-loops-codex-workflows/linkedin-article.md.',
        'No tests or benchmarks run.',
        '› Implement {feature}',
        'gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund',
        '• Working (12s • esc to interrupt)',
      ].join('\n')
      expect(detectStatus(output, 'codex')).toBe('running')
      expect(hasCodexInteractivePrompt(output, { allowActiveMarker: true })).toBe(true)
    })

    it('does not treat the initial Codex prompt echo as waiting before work starts', () => {
      const output = '› Write tests for @filename gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund'
      expect(detectStatus(output, 'codex')).toBe('running')
    })

    it('does not treat the initial wrapped Codex prompt as waiting before work starts', () => {
      const output = [
        '› Use /skills to list available skills',
        '',
        'gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund',
      ].join('\n')
      expect(detectStatus(output, 'codex')).toBe('running')
    })

    it('does not treat repeated Codex prompt lines as waiting before work starts', () => {
      const output = [
        '› Write tests for @filename gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund',
        '› Write tests for @filename gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund',
      ].join('\n')
      expect(detectStatus(output, 'codex')).toBe('running')
    })

    it('does not treat repeated wrapped Codex prompts as waiting before work starts', () => {
      const output = [
        '› Use /skills to list available skills',
        'gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund',
        '› Use /skills to list available skills',
        'gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund',
      ].join('\n')
      expect(detectStatus(output, 'codex')).toBe('running')
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
