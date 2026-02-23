import React from 'react'
import { modalStyles } from '../NewTaskModal.styles'
import type { ModalTab } from './types'

export function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: ModalTab
  onTabChange: (tab: ModalTab) => void
}): React.JSX.Element {
  return (
    <div style={modalStyles.tabBar}>
      <button
        type="button"
        onClick={() => onTabChange('new')}
        style={{
          ...modalStyles.tab,
          ...(activeTab === 'new' ? modalStyles.tabActive : {}),
        }}
      >
        New Branch
      </button>
      <button
        type="button"
        onClick={() => onTabChange('existing')}
        style={{
          ...modalStyles.tab,
          ...(activeTab === 'existing' ? modalStyles.tabActive : {}),
        }}
      >
        Existing Branch / PR
      </button>
    </div>
  )
}
