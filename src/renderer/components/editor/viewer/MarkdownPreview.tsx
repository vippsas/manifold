import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidBlock } from '../MermaidBlock'
import {
  extractMarkdownFrontmatter,
  isExternalMarkdownHref,
  type MarkdownFrontmatterEntry,
  resolveMarkdownLinkedFilePath,
  resolveMarkdownPreviewSource,
} from '../code-viewer-utils'
import { setBounded } from '../bounded-cache'

// LRU-capped so this remount-surviving cache doesn't grow without bound as
// markdown files/panes/sessions open and close.
const markdownScrollPositionsByPreview = new Map<string, number>()
const MAX_MARKDOWN_SCROLL_POSITIONS = 200

interface MarkdownPreviewProps {
  paneId: string
  filePath: string
  fileContent: string
  onOpenLinkedFile: (filePath: string) => void
}

export function MarkdownPreview({
  paneId,
  filePath,
  fileContent,
  onOpenLinkedFile,
}: MarkdownPreviewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const scrollKey = `${paneId}:${filePath}`
  const markdownComponents = useMemo(
    () => createMarkdownComponents(filePath, onOpenLinkedFile),
    [filePath, onOpenLinkedFile],
  )
  const { entries: frontmatterEntries, body: markdownBody } = useMemo(
    () => extractMarkdownFrontmatter(fileContent),
    [fileContent],
  )

  const persistScrollPosition = useCallback((): void => {
    const container = containerRef.current
    if (!container) return
    setBounded(markdownScrollPositionsByPreview, scrollKey, container.scrollTop, MAX_MARKDOWN_SCROLL_POSITIONS)
  }, [scrollKey])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scrollTop = markdownScrollPositionsByPreview.get(scrollKey)
    if (scrollTop !== undefined && container.scrollTop !== scrollTop) {
      container.scrollTop = scrollTop
    }
  })

  useEffect(() => (
    () => {
      const container = containerRef.current
      if (!container) return
      setBounded(markdownScrollPositionsByPreview, scrollKey, container.scrollTop, MAX_MARKDOWN_SCROLL_POSITIONS)
    }
  ), [scrollKey])

  return (
    <div
      ref={containerRef}
      className="markdown-preview"
      onScroll={persistScrollPosition}
      onMouseDownCapture={persistScrollPosition}
    >
      {frontmatterEntries.length > 0 && <FrontmatterBlock entries={frontmatterEntries} />}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{markdownBody}</ReactMarkdown>
    </div>
  )
}

function FrontmatterBlock({ entries }: { entries: MarkdownFrontmatterEntry[] }): React.JSX.Element {
  return (
    <dl className="markdown-frontmatter" aria-label="Frontmatter">
      {entries.map(({ key, value }) => (
        <div className="markdown-frontmatter__row" key={key}>
          <dt className="markdown-frontmatter__key">{key}</dt>
          <dd className="markdown-frontmatter__value">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

function createMarkdownComponents(
  currentFilePath: string,
  onOpenLinkedFile: (filePath: string) => void,
) {
  return {
    code({ className, children, ...props }: React.ComponentProps<'code'>) {
      if (className === 'language-mermaid') {
        return <MermaidBlock chart={String(children).replace(/\n$/, '')} />
      }
      return <code className={className} {...props}>{children}</code>
    },
    a({ href, children, onClick, rel, target, ...props }: React.ComponentProps<'a'>) {
      const resolvedFilePath = resolveMarkdownLinkedFilePath(currentFilePath, href)
      const isExternalLink = isExternalMarkdownHref(href)

      const handleClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
        onClick?.(event)
        if (event.defaultPrevented || !resolvedFilePath) return
        event.preventDefault()
        onOpenLinkedFile(resolvedFilePath)
      }

      return (
        <a
          href={href}
          onClick={handleClick}
          rel={isExternalLink ? (rel ?? 'noreferrer') : rel}
          target={isExternalLink ? (target ?? '_blank') : target}
          {...props}
        >
          {children}
        </a>
      )
    },
    img({ alt, src, ...props }: React.ComponentProps<'img'>) {
      return <img {...props} src={resolveMarkdownPreviewSource(currentFilePath, src)} alt={alt} />
    },
  }
}
