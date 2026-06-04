// src/renderer/components/editor/dock-panels.contributions.test.tsx
import { describe, expect, it } from 'vitest'
import { PANEL_COMPONENTS } from './dock-panels'
import { BackgroundAgentPanel } from '../background-agent/BackgroundAgentPanel'
import { LoopPanel } from '../loop/LoopPanel'
import { VerdictsPanel } from '../verdicts/VerdictsPanel'
import { WatchPanel } from '../watch/WatchPanel'

describe('PANEL_COMPONENTS module entries', () => {
  it('still includes the six core panels', () => {
    for (const id of ['agent', 'editor', 'fileTree', 'modifiedFiles', 'shell', 'projects']) {
      expect(typeof PANEL_COMPONENTS[id]).toBe('function')
    }
  })

  it('sources the four module panels from the contribution registry', () => {
    expect(PANEL_COMPONENTS.backgroundAgent).toBe(BackgroundAgentPanel)
    expect(PANEL_COMPONENTS.loop).toBe(LoopPanel)
    expect(PANEL_COMPONENTS.verdicts).toBe(VerdictsPanel)
    expect(PANEL_COMPONENTS.watch).toBe(WatchPanel)
  })
})
