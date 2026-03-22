import { useEffect, useState } from 'react'

interface UseResolvedHtmlPreviewParams {
  isHtml: boolean
  fileContent: string | null
  sessionId: string | null
  activeFilePath: string | null
}

export function useResolvedHtmlPreview({
  isHtml,
  fileContent,
  sessionId,
  activeFilePath,
}: UseResolvedHtmlPreviewParams): string | null {
  const [resolvedHtml, setResolvedHtml] = useState<string | null>(null)

  useEffect(() => {
    if (!isHtml || !fileContent || !sessionId || !activeFilePath) {
      setResolvedHtml(null)
      return
    }

    let cancelled = false
    const dir = activeFilePath.includes('/') ? activeFilePath.replace(/\/[^/]+$/, '') : ''

    void (async (): Promise<void> => {
      const linkPattern = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi
      const altPattern = /<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*\/?>/gi
      const hrefs = new Set<string>()

      for (const regex of [linkPattern, altPattern]) {
        let match: RegExpExecArray | null
        while ((match = regex.exec(fileContent)) !== null) hrefs.add(match[1])
      }

      let html = fileContent
      for (const href of hrefs) {
        if (href.startsWith('http://') || href.startsWith('https://')) continue
        const cssPath = dir ? `${dir}/${href}` : href
        try {
          const css = (await window.electronAPI.invoke('files:read', sessionId, cssPath)) as string
          const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const tagPattern = new RegExp(`<link\\s+[^>]*href=["']${escapedHref}["'][^>]*\\/?>`, 'gi')
          html = html.replace(tagPattern, `<style>${css}</style>`)
        } catch {
          // CSS file not found; keep the original link tag.
        }
      }

      if (!cancelled) {
        setResolvedHtml(html)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeFilePath, fileContent, isHtml, sessionId])

  return resolvedHtml
}
