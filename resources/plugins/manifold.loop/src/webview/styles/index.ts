import type React from 'react'
import { panelStyles } from './panel.styles'
import { formStyles } from './form.styles'
import { iterationStyles, outcomeColors, stateColors } from './iteration.styles'

export const loopPanelStyles: Record<string, React.CSSProperties> = { ...panelStyles, ...formStyles, ...iterationStyles }
export { outcomeColors, stateColors }
