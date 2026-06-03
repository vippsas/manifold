import React from 'react'
import type { FetchResult } from '../../../shared/types'
import { sidebarStyles } from './ProjectSidebar.styles'

interface FetchMessageProps {
  result: Pick<FetchResult, 'updatedBranch' | 'commitCount'> | null
  error: string | null
}

export function FetchMessage({ result, error }: FetchMessageProps): React.JSX.Element | null {
  if (result) {
    return (
      <div style={sidebarStyles.fetchMessage}>
        {result.commitCount > 0
          ? `Updated ${result.updatedBranch}: ${result.commitCount} new commit${result.commitCount !== 1 ? 's' : ''}`
          : `${result.updatedBranch} is up to date`}
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ ...sidebarStyles.fetchMessage, color: 'var(--error, #f44)' }}>
        {error}
      </div>
    )
  }
  return null
}
