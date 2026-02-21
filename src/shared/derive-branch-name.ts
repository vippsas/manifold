const STOPWORDS = new Set([
  'the', 'a', 'an', 'in', 'to', 'for', 'of', 'on', 'is', 'it', 'its',
  'with', 'from', 'by', 'at', 'as', 'be', 'or', 'and', 'but', 'not',
  'this', 'that', 'all', 'my', 'our', 'your', 'do', 'does', 'did',
])

const MAX_LENGTH = 40
const PREFIX = 'manifold/'

export function deriveBranchName(description: string): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w))
    .slice(0, 5)

  if (words.length === 0) return ''

  let slug = words.join('-')
  const maxSlugLen = MAX_LENGTH - PREFIX.length
  if (slug.length > maxSlugLen) {
    slug = slug.slice(0, maxSlugLen).replace(/-[^-]*$/, '')
  }

  return `${PREFIX}${slug}`
}
