// src/renderer/components/editor/dock-panels.contributions.test.tsx
import { describe, expect, it } from 'vitest'
import { PANEL_COMPONENTS } from './dock-panels'
import { BackgroundAgentPanel } from '../background-agent/BackgroundAgentPanel'
import { VerdictsPanel } from '../verdicts/VerdictsPanel'

describe('PANEL_COMPONENTS module entries', () => {
  it('still includes the six core panels', () => {
    for (const id of ['agent', 'editor', 'fileTree', 'modifiedFiles', 'shell', 'projects']) {
      expect(typeof PANEL_COMPONENTS[id]).toBe('function')
    }
  })

  it('sources the two module panels from the contribution registry', () => {
    expect(PANEL_COMPONENTS.backgroundAgent).toBe(BackgroundAgentPanel)
    expect(PANEL_COMPONENTS.verdicts).toBe(VerdictsPanel)
  })
})
