import React, { useEffect, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    background: '#282a36',
    primaryColor: '#393b47',
    primaryTextColor: '#f8f8f2',
    primaryBorderColor: '#4d4f5c',
  },
})

let idCounter = 0

interface MermaidBlockProps {
  chart: string
}

export function MermaidBlock({ chart }: MermaidBlockProps): React.JSX.Element {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const id = `mermaid-${idCounter++}`

    mermaid
      .render(id, chart)
      .then(({ svg: renderedSvg }) => {
        if (!cancelled) setSvg(renderedSvg)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
    }
  }, [chart])

  if (error) {
    return (
      <div className="mermaid-error">
        <div className="mermaid-error-message">{error}</div>
        <pre><code>{chart}</code></pre>
      </div>
    )
  }

  if (svg) {
    return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
  }

  return <div className="mermaid-loading">Rendering diagram…</div>
}
