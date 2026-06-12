const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/

export function isExternalMarkdownHref(href: string | null | undefined): boolean {
  if (!href) return false
  if (href.startsWith('//')) return true
  if (!URL_SCHEME_PATTERN.test(href)) return false
  return !href.toLowerCase().startsWith('file:')
}

export function resolveMarkdownLinkedFilePath(currentFilePath: string, href: string | null | undefined): string | null {
  if (!href || href.startsWith('#') || isExternalMarkdownHref(href)) {
    return null
  }

  const resolved = resolveMarkdownFileUrl(currentFilePath, href)
  return resolved ? fileUrlToPath(resolved) : null
}

export function resolveMarkdownPreviewSource(currentFilePath: string, source: string | null | undefined): string | undefined {
  if (!source) return undefined
  if (source.startsWith('#') || isExternalMarkdownHref(source)) return source
  return resolveMarkdownFileUrl(currentFilePath, source)?.toString() ?? source
}

export interface MarkdownFrontmatterEntry {
  key: string
  value: string
}

export interface MarkdownFrontmatterResult {
  entries: MarkdownFrontmatterEntry[]
  body: string
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function extractMarkdownFrontmatter(content: string): MarkdownFrontmatterResult {
  const match = content.match(FRONTMATTER_PATTERN)
  if (!match) return { entries: [], body: content }

  const entries = parseFrontmatterBlock(match[1])
  if (entries.length === 0) return { entries: [], body: content }

  return { entries, body: content.slice(match[0].length) }
}

function parseFrontmatterBlock(block: string): MarkdownFrontmatterEntry[] {
  const entries: MarkdownFrontmatterEntry[] = []
  const lines = block.split(/\r?\n/)

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue
    if (/^\s/.test(rawLine)) {
      const previous = entries[entries.length - 1]
      if (previous) {
        const continuation = rawLine.trim()
        previous.value = previous.value ? `${previous.value} ${continuation}` : continuation
      }
      continue
    }

    const separator = rawLine.indexOf(':')
    if (separator === -1) continue

    const key = rawLine.slice(0, separator).trim()
    if (!key) continue
    const value = normalizeFrontmatterValue(rawLine.slice(separator + 1).trim())
    entries.push({ key, value })
  }

  return entries
}

function normalizeFrontmatterValue(rawValue: string): string {
  if (!rawValue) return ''
  if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
    return rawValue.slice(1, -1)
  }
  return rawValue
}

function filePathToUrl(filePath: string): URL {
  const normalized = filePath.replace(/\\/g, '/')
  const pathname = normalized.startsWith('/') ? normalized : `/${normalized}`
  return new URL(`file://${encodeURI(pathname)}`)
}

function resolveMarkdownFileUrl(currentFilePath: string, href: string): URL | null {
  try {
    const resolved = href.toLowerCase().startsWith('file:')
      ? new URL(href)
      : new URL(href, filePathToUrl(currentFilePath))

    return resolved.protocol === 'file:' ? resolved : null
  } catch {
    return null
  }
}

function fileUrlToPath(url: URL): string {
  const pathname = decodeURIComponent(url.pathname)
  return /^\/[a-zA-Z]:\//.test(pathname) ? pathname.slice(1) : pathname
}
