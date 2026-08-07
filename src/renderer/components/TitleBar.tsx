import React from 'react'
import { titleBarStyles as styles } from './TitleBar.styles'

interface TitleBarProps {
  projectName?: string
}

export function TitleBar({ projectName }: TitleBarProps): React.JSX.Element {
  return (
    <div style={styles.container}>
      <div style={styles.trafficLightSpacer} />
      <div style={styles.titleArea}>
        {!projectName && <span style={styles.title}>Manifold</span>}
      </div>
    </div>
  )
}
