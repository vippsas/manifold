import React from 'react'
import type { TemplateFieldSchema, TemplateInputValue } from '../../shared/provisioning-types'
import * as styles from './CreateAppDialog.styles'

interface Props {
  fieldKey: string
  schema: TemplateFieldSchema
  value: TemplateInputValue
  required: boolean
  disabled: boolean
  error?: string
  autoFocus?: boolean
  onChange: (value: TemplateInputValue) => void
}

function normalizeNumber(value: string, integer: boolean): number | '' {
  if (!value.trim()) return ''
  const parsed = integer ? Number.parseInt(value, 10) : Number.parseFloat(value)
  return Number.isNaN(parsed) ? '' : parsed
}

export function CreateAppFieldControl({
  fieldKey,
  schema,
  value,
  required,
  disabled,
  error,
  autoFocus = false,
  onChange,
}: Props): React.JSX.Element {
  const label = schema.title ?? fieldKey

  if (schema.type === 'boolean') {
    return (
      <label style={{ ...styles.fieldLabel, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
        />
        <span>{label}</span>
      </label>
    )
  }

  const helpText = schema.description

  if (schema.enum?.length) {
    return (
      <>
        <label style={styles.fieldLabel}>{label}{required ? ' *' : ''}</label>
        <select
          style={styles.select}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoFocus={autoFocus}
        >
          {!required && <option value="">Select an option</option>}
          {schema.enum.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {helpText && <div style={styles.helpText}>{helpText}</div>}
        {error && <div style={styles.errorText}>{error}</div>}
      </>
    )
  }

  if (schema.type === 'integer' || schema.type === 'number') {
    const stringValue = value === '' ? '' : String(value ?? '')
    return (
      <>
        <label style={styles.fieldLabel}>{label}{required ? ' *' : ''}</label>
        <input
          type="number"
          style={styles.input}
          value={stringValue}
          min={schema.minimum}
          max={schema.maximum}
          step={schema.step ?? (schema.type === 'integer' ? 1 : 'any')}
          placeholder={schema.placeholder ?? ''}
          onChange={(event) => onChange(normalizeNumber(event.target.value, schema.type === 'integer'))}
          disabled={disabled}
          autoFocus={autoFocus}
        />
        {helpText && <div style={styles.helpText}>{helpText}</div>}
        {error && <div style={styles.errorText}>{error}</div>}
      </>
    )
  }

  const inputValue = typeof value === 'string' ? value : String(value ?? '')
  return (
    <>
      <label style={styles.fieldLabel}>{label}{required ? ' *' : ''}</label>
      {schema.multiline ? (
        <textarea
          style={styles.textarea}
          placeholder={schema.placeholder ?? ''}
          value={inputValue}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoFocus={autoFocus}
        />
      ) : (
        <input
          style={styles.input}
          placeholder={schema.placeholder ?? ''}
          value={inputValue}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoFocus={autoFocus}
        />
      )}
      {helpText && <div style={styles.helpText}>{helpText}</div>}
      {error && <div style={styles.errorText}>{error}</div>}
    </>
  )
}
