import React from 'react'
import type { NotificationScope, NotificationSettings } from '../../../../shared/types'
import { modalStyles } from '../SettingsModal.styles'
import { SectionCard, SectionHeader } from './SettingsSectionLayout'

interface Props {
  value: NotificationSettings
  onChange: (value: NotificationSettings) => void
  soundEnabled: boolean
  onSoundChange: (enabled: boolean) => void
}

const SCOPE_OPTIONS: Array<{ id: NotificationScope; label: string }> = [
  { id: 'non-active', label: 'Sessions I am not viewing' },
  { id: 'unfocused', label: 'Only when Manifold is in the background' },
  { id: 'always', label: 'Always' },
]

export function NotificationSettingsSection({ value, onChange, soundEnabled, onSoundChange }: Props): React.JSX.Element {
  const set = (patch: Partial<NotificationSettings>): void => onChange({ ...value, ...patch })
  const dim = value.enabled ? {} : { opacity: 0.5 }
  const disabled = !value.enabled

  return (
    <>
    <SectionHeader
      title="Notifications"
      description="Native desktop notifications and sound cues for agent activity."
    />
    <SectionCard
      title="Desktop Notifications"
      description="Native notifications when an agent finishes, needs input, or errors. macOS Focus / Do Not Disturb is respected automatically."
    >
      <div style={modalStyles.fieldGrid}>
        <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => set({ enabled: event.target.checked })}
            style={modalStyles.checkboxInput}
          />
          Enable desktop notifications
        </label>
        <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull, ...dim }}>
          <input
            type="checkbox"
            checked={value.onDone}
            disabled={disabled}
            onChange={(event) => set({ onDone: event.target.checked })}
            style={modalStyles.checkboxInput}
          />
          When an agent finishes
        </label>
        <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull, ...dim }}>
          <input
            type="checkbox"
            checked={value.onWaiting}
            disabled={disabled}
            onChange={(event) => set({ onWaiting: event.target.checked })}
            style={modalStyles.checkboxInput}
          />
          When an agent needs input
        </label>
        <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull, ...dim }}>
          <input
            type="checkbox"
            checked={value.onError}
            disabled={disabled}
            onChange={(event) => set({ onError: event.target.checked })}
            style={modalStyles.checkboxInput}
          />
          When an agent hits an error
        </label>
        <label style={{ ...modalStyles.label, ...modalStyles.fieldSpanFull, ...dim }}>
          Notify for
          <select
            value={value.scope}
            disabled={disabled}
            onChange={(event) => set({ scope: event.target.value as NotificationScope })}
            style={modalStyles.select}
          >
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(event) => onSoundChange(event.target.checked)}
            style={modalStyles.checkboxInput}
          />
          Play sound when agent stops running
        </label>
      </div>
    </SectionCard>
    </>
  )
}
