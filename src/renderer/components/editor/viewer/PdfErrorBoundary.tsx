import React from 'react'

interface PdfErrorBoundaryProps {
  children: React.ReactNode
}

interface PdfErrorBoundaryState {
  error: Error | null
}

const fallbackStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  padding: '16px',
  boxSizing: 'border-box',
  background: 'var(--bg-primary)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--type-ui-caption)',
  textAlign: 'center',
}

// Isolates the PDF viewer: any render- or effect-phase error renders an inline
// message instead of unmounting the whole editor. Reset by keying this boundary
// to the file path at the call site, so opening a different file starts fresh.
export class PdfErrorBoundary extends React.Component<PdfErrorBoundaryProps, PdfErrorBoundaryState> {
  state: PdfErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): PdfErrorBoundaryState {
    return { error }
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return <div style={fallbackStyle}>Could not display PDF: {this.state.error.message}</div>
    }
    return this.props.children
  }
}
