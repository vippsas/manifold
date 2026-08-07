import { RepoFetchButton } from './RepoFetchButton'

// The three states the folder row's fetch action has, side by side: quiet when
// the base branch is level with origin, an accent pill carrying the count once
// it trails, and disabled mid-fetch. The row hides these behind hover, so this
// fixture is the only place all three are visible at once.
function State({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 96, color: 'var(--text-muted)', fontSize: 'var(--type-ui-small)' }}>{label}</span>
      <div className="sidebar-item-actions" style={{ opacity: 0.95, pointerEvents: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

export default (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20, background: 'var(--bg-sidebar)' }}>
    <State label="up to date">
      <RepoFetchButton repoName="storefront" baseBranch="main" behindCount={0} isFetching={false} onFetch={() => undefined} />
    </State>
    <State label="3 behind">
      <RepoFetchButton repoName="storefront" baseBranch="main" behindCount={3} isFetching={false} onFetch={() => undefined} />
    </State>
    <State label="42 behind">
      <RepoFetchButton repoName="storefront" baseBranch="main" behindCount={42} isFetching={false} onFetch={() => undefined} />
    </State>
    <State label="fetching">
      <RepoFetchButton repoName="storefront" baseBranch="main" behindCount={3} isFetching onFetch={() => undefined} />
    </State>
  </div>
)
