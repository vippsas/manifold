import type React from 'react'
import { createDialogStyles, dialogPrimitives } from '../workbench-style-primitives'

const base = createDialogStyles('420px')

export const popoverStyles: Record<string, React.CSSProperties> = {
  ...base,
  input: {
    ...base.input,
    fontFamily: 'var(--font-mono)',
  },
  cancelButton: base.secondaryButton,
  launchButton: base.primaryButton,
  errorText: dialogPrimitives.errorText,
}
