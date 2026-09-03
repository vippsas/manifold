import { describe, expect, it } from 'vitest'
import { orchestratedInteractiveArgs } from './orchestrated-args'

describe('orchestratedInteractiveArgs', () => {
  it('actually enables bypass for Claude, which its default flag only offers', () => {
    // `--allow-dangerously-skip-permissions` (the base arg) enables bypass "as an option,
    // without it being enabled by default", so an unattended worker would still prompt.
    expect(orchestratedInteractiveArgs('claude')).toEqual(['--dangerously-skip-permissions'])
  })

  it('bypasses approvals and the sandbox for Codex, and silences its startup update menu', () => {
    // A newer release makes codex open an interactive "Update now" menu on launch. An orchestrated
    // worker's prompt and Enter then land in that menu — a real reviewer sat idle at it until its
    // 30-minute budget ran out, and Enter on option 1 runs `brew upgrade`.
    expect(orchestratedInteractiveArgs('codex')).toEqual([
      '--dangerously-bypass-approvals-and-sandbox',
      '-c', 'check_for_update_on_startup=false',
    ])
  })

  it('adds nothing for a runtime whose base args already bypass', () => {
    // Copilot's registry entry already carries --yolo.
    expect(orchestratedInteractiveArgs('copilot')).toEqual([])
  })

  it('auto-approves for Gemini', () => {
    expect(orchestratedInteractiveArgs('gemini')).toEqual(['--yolo'])
  })

  it('adds nothing for an unknown runtime rather than guessing a flag', () => {
    expect(orchestratedInteractiveArgs('ollama-claude')).toEqual([])
    expect(orchestratedInteractiveArgs('nope')).toEqual([])
  })
})
