import type React from 'react'
import { panelStyles } from './panel.styles'
import { formStyles } from './form.styles'
import { iterationStyles, outcomeColors, outcomeBorder } from './iteration.styles'
import { liverunStyles } from './liverun.styles'

export const loopPanelStyles: Record<string, React.CSSProperties> = { ...panelStyles, ...formStyles, ...iterationStyles, ...liverunStyles }
export { outcomeColors, outcomeBorder }
