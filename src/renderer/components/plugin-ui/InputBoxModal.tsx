import React, { useCallback, useRef, useState } from 'react'
import type { UiRequest } from '../../../shared/plugins/ui'
import { createDialogStyles } from '../workbench-style-primitives'
import { useAutoFocus } from '../../hooks/useAutoFocus'

type InputBoxReq = Extract<UiRequest, { kind: 'inputBox' }>

const styles = createDialogStyles('400px')

const extraStyles: Record<string, React.CSSProperties> = {
  fieldInput: {
    ...styles.input,
    width: '100%',
    boxSizing: 'border-box',
  },
  promptLabel: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-secondary)',
    marginBottom: '4px',
  },
}

interface InputBoxModalProps {
  req: InputBoxReq
  onSubmit: (value: string | undefined) => void
}

export function InputBoxModal({ req, onSubmit }: InputBoxModalProps): React.JSX.Element {
  const opts = req.options
  const [value, setValue] = useState(opts.value ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useAutoFocus(true, inputRef)

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target === overlayRef.current) onSubmit(undefined)
    },
    [onSubmit],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Escape') {
        onSubmit(undefined)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        onSubmit(value)
      }
    },
    [value, onSubmit],
  )

  const title = opts.title ?? 'Input'

  return (
    <div
      ref={overlayRef}
      style={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>{title}</span>
        </div>
        <div style={styles.body}>
          {opts.prompt && <div style={extraStyles.promptLabel}>{opts.prompt}</div>}
          <input
            ref={inputRef}
            type={opts.password ? 'password' : 'text'}
            style={extraStyles.fieldInput}
            placeholder={opts.placeholder ?? ''}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label={opts.prompt ?? title}
            autoComplete="off"
          />
        </div>
        <div style={styles.footer}>
          <button
            type="button"
            style={styles.cancelButton}
            onClick={() => onSubmit(undefined)}
          >
            Cancel
          </button>
          <button
            type="button"
            style={styles.saveButton}
            onClick={() => onSubmit(value)}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
