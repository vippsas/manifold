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
    const baseHref = resolveHtmlPreviewBaseHref(activeFilePath)

    void (async (): Promise<void> => {
      const linkPattern = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi
      const altPattern = /<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*\/?>/gi
      const imagePattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
      const hrefs = new Set<string>()
      const imageSources = new Set<string>()

      for (const regex of [linkPattern, altPattern]) {
        let match: RegExpExecArray | null
        while ((match = regex.exec(fileContent)) !== null) hrefs.add(match[1])
      }

      let imageMatch: RegExpExecArray | null
      while ((imageMatch = imagePattern.exec(fileContent)) !== null) {
        imageSources.add(imageMatch[1])
      }

      let html = injectHtmlPreviewBaseHref(fileContent, baseHref)
      for (const href of hrefs) {
        if (isExternalPreviewResource(href)) continue

        const cssPath = resolvePreviewFilePath(baseHref, href)
        if (!cssPath) continue

        try {
          const css = (await window.electronAPI.invoke('files:read', sessionId, cssPath)) as string
          const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const tagPattern = new RegExp(`<link\\s+[^>]*href=["']${escapedHref}["'][^>]*\\/?>`, 'gi')
          html = html.replace(tagPattern, `<style>${css}</style>`)
        } catch {
          // CSS file not found; keep the original link tag.
        }
      }

      for (const src of imageSources) {
        if (isExternalPreviewResource(src)) continue

        const imagePath = resolvePreviewFilePath(baseHref, src)
        if (!imagePath) continue

        try {
          const dataUrl = (await window.electronAPI.invoke('files:read-data-url', sessionId, imagePath)) as string
          const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const tagPattern = new RegExp(`(<img\\b[^>]*\\bsrc=["'])${escapedSrc}(["'][^>]*>)`, 'gi')
          html = html.replace(tagPattern, `$1${dataUrl}$2`)
        } catch {
          // Image file not found or unreadable; keep the original src.
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

export function resolveHtmlPreviewBaseHref(filePath: string): string {
  return new URL('./', filePathToUrl(filePath)).toString()
}

export function injectHtmlPreviewBaseHref(html: string, baseHref: string): string {
  if (/<base\b[^>]*href=/i.test(html)) return html

  const baseTag = `<base href="${baseHref}">`

  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}${baseTag}`)
  }

  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (match) => `${match}<head>${baseTag}</head>`)
  }

  const doctypeMatch = html.match(/^\s*<!doctype[^>]*>/i)
  if (!doctypeMatch) {
    return `<head>${baseTag}</head>${html}`
  }

  const doctype = doctypeMatch[0]
  return `${doctype}<head>${baseTag}</head>${html.slice(doctype.length)}`
}

function isExternalPreviewResource(path: string): boolean {
  if (!path) return true
  if (path.startsWith('//')) return true
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(path)) return false
  return !path.toLowerCase().startsWith('file:')
}

function resolvePreviewFilePath(baseHref: string, path: string): string | null {
  try {
    const resolved = path.toLowerCase().startsWith('file:')
      ? new URL(path)
      : new URL(path, baseHref)

    if (resolved.protocol !== 'file:') return null
    return fileUrlToPath(resolved)
  } catch {
    return null
  }
}

function filePathToUrl(filePath: string): URL {
  const normalized = filePath.replace(/\\/g, '/')
  const pathname = normalized.startsWith('/') ? normalized : `/${normalized}`
  return new URL(`file://${encodeURI(pathname)}`)
}

function fileUrlToPath(url: URL): string {
  const pathname = decodeURIComponent(url.pathname)
  return /^\/[a-zA-Z]:\//.test(pathname) ? pathname.slice(1) : pathname
}
