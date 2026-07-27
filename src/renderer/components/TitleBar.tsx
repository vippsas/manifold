import React from 'react'
import { titleBarStyles as styles } from './TitleBar.styles'
import { TitleBarSearch, type TitleBarSearchWiring } from './TitleBarSearch'

interface TitleBarProps {
  projectName?: string
  search?: TitleBarSearchWiring
}

export function TitleBar({ projectName, search }: TitleBarProps): React.JSX.Element {
  return (
    <div style={styles.container}>
      <div style={styles.leftGroup}>
        <div style={styles.trafficLightSpacer} />
        <div style={styles.titleArea}>
          {!projectName && <span style={styles.title}>Manifold</span>}
        </div>
      </div>
      {search?.activeProjectId && <TitleBarSearch search={search} />}
      <div style={styles.rightGroup} />
    </div>
  )
}
