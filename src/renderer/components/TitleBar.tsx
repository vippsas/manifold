import React from 'react'
import { titleBarStyles as styles } from './TitleBar.styles'

export function TitleBar(): React.JSX.Element {
  return (
    <div style={styles.container}>
      <div style={styles.trafficLightSpacer} />
      <div style={styles.title}>Manifold</div>
    </div>
  )
}
