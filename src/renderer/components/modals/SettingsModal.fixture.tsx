import React, { useEffect } from 'react'
import { DEFAULT_SETTINGS } from '../../../shared/defaults'
import { SettingsModal } from './SettingsModal'

export default function SettingsModalFixture(): React.JSX.Element {
  useEffect(() => {
    const panel = document.querySelector<HTMLElement>('[role="tabpanel"]')
    if (panel) panel.scrollTop = panel.scrollHeight
  }, [])

  return (
    <SettingsModal
      visible
      settings={{ ...DEFAULT_SETTINGS, setupCompleted: true }}
      onSave={() => {}}
      onClose={() => {}}
    />
  )
}
