import React from 'react'

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }
  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: '#f88', fontFamily: 'monospace' }}>
          <h2>Something went wrong</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 10, opacity: 0.7 }}>{this.state.error.stack}</pre>
          <button
            onClick={() => { this.setState({ error: null }); this.props.onReset() }}
            style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}
          >
            Back to Dashboard
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
