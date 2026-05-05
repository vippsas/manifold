import React from 'react'
import type { TranscriptionSettings } from '../../../../shared/watch-types'
import { SectionCard, SectionHeader } from './SettingsSectionLayout'

interface Props {
  value: TranscriptionSettings
  onChange: (next: TranscriptionSettings) => void
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', borderRadius: 4,
  background: 'var(--bg-input)', color: 'var(--text-default)',
  border: '1px solid var(--border-subtle)', fontSize: 13,
}

const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.75, marginBottom: 4, display: 'block' }
const fieldRow: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }

const PROVIDER_LABELS: Record<TranscriptionSettings['provider'], string> = {
  none: 'None (captions only)',
  openai: 'OpenAI',
  azure: 'Azure OpenAI',
}

export function TranscriptionSettingsSection({ value, onChange }: Props): React.JSX.Element {
  return (
    <>
      <SectionHeader
        title="Transcription"
        description="Provider used by the Watch panel when a video has no native captions. Captions-only mode is fine if you don't analyze captionless content."
      />
      <SectionCard
        title="Provider"
        description="Pick OpenAI or Azure OpenAI. Manifold uses gpt-4o-transcribe; keys stay in your Manifold config."
      >
        <div style={{ display: 'flex', gap: 16 }}>
          {(['none', 'openai', 'azure'] as const).map((p) => (
            <label key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="radio"
                name="transcription-provider"
                value={p}
                checked={value.provider === p}
                onChange={() => onChange({ ...value, provider: p })}
              />
              {PROVIDER_LABELS[p]}
            </label>
          ))}
        </div>

        {value.provider === 'openai' && (
          <div style={fieldRow}>
            <label style={labelStyle}>OPENAI_API_KEY</label>
            <input
              type="password"
              style={inputStyle}
              value={value.openaiApiKey ?? ''}
              onChange={(e) => onChange({ ...value, openaiApiKey: e.target.value })}
            />
          </div>
        )}

        {value.provider === 'azure' && (
          <>
            <div style={fieldRow}>
              <label style={labelStyle}>AZURE_OPENAI_API_KEY</label>
              <input
                type="password"
                style={inputStyle}
                value={value.azureApiKey ?? ''}
                onChange={(e) => onChange({ ...value, azureApiKey: e.target.value })}
              />
            </div>
            <div style={fieldRow}>
              <label style={labelStyle}>AZURE_OPENAI_ENDPOINT</label>
              <input
                type="text"
                style={inputStyle}
                value={value.azureEndpoint ?? ''}
                placeholder="https://your-resource.openai.azure.com"
                onChange={(e) => onChange({ ...value, azureEndpoint: e.target.value })}
              />
            </div>
            <div style={fieldRow}>
              <label style={labelStyle}>AZURE_OPENAI_DEPLOYMENT</label>
              <input
                type="text"
                style={inputStyle}
                value={value.azureDeployment ?? ''}
                placeholder="gpt-4o-transcribe"
                onChange={(e) => onChange({ ...value, azureDeployment: e.target.value })}
              />
            </div>
          </>
        )}
      </SectionCard>
    </>
  )
}
