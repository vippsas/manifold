import React from 'react'
import type { EditorSettings } from '../../../../shared/types'
import { modalStyles } from '../SettingsModal.styles'
import { SectionCard, SectionHeader } from './SettingsSectionLayout'

interface Props {
  value: EditorSettings
  onChange: (value: EditorSettings) => void
}

export function EditorSettingsSection({ value, onChange }: Props): React.JSX.Element {
  function set<K extends keyof EditorSettings>(key: K, next: EditorSettings[K]): void {
    onChange({ ...value, [key]: next })
  }

  return (
    <>
      <SectionHeader
        title="Editor"
        description="Font, indentation, wrapping, and minimap for the code editor."
      />
      <div style={modalStyles.cardGrid}>
        <SectionCard title="Text" description="Font and indentation used by the code editor.">
          <div style={modalStyles.fieldGrid}>
            <label style={modalStyles.label}>
              Font Size
              <input
                type="number" min={8} max={32} step={1} value={value.fontSize}
                onChange={(event) => {
                  const n = parseInt(event.target.value, 10)
                  if (!Number.isNaN(n) && n > 0) set('fontSize', n)
                }}
                style={modalStyles.input}
              />
            </label>
            <label style={modalStyles.label}>
              Tab Size
              <input
                type="number" min={1} max={8} step={1} value={value.tabSize}
                onChange={(event) => {
                  const n = parseInt(event.target.value, 10)
                  if (!Number.isNaN(n) && n > 0) set('tabSize', n)
                }}
                style={modalStyles.input}
              />
            </label>
            <label style={{ ...modalStyles.label, ...modalStyles.fieldSpanFull }}>
              Font Family
              <input
                type="text" value={value.fontFamily}
                onChange={(event) => set('fontFamily', event.target.value)}
                style={modalStyles.input}
                placeholder="SF Mono, Fira Code, Menlo, monospace"
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard title="Display" description="Wrapping and the minimap.">
          <div style={modalStyles.fieldGrid}>
            <label style={modalStyles.label}>
              Word Wrap
              <select
                value={value.wordWrap}
                onChange={(event) => set('wordWrap', event.target.value as 'on' | 'off')}
                style={modalStyles.select}
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </label>
            <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
              <input
                type="checkbox" checked={value.minimap}
                onChange={(event) => set('minimap', event.target.checked)}
                style={modalStyles.checkboxInput}
              />
              Show minimap
            </label>
          </div>
        </SectionCard>
      </div>
    </>
  )
}
