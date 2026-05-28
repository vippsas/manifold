export { fileName } from './code-viewer-paths'
export {
  type FileTabLabel,
  getFileTabLabels,
} from './code-viewer-tab-labels'
export {
  isExternalMarkdownHref,
  resolveMarkdownLinkedFilePath,
  resolveMarkdownPreviewSource,
  extractMarkdownFrontmatter,
  type MarkdownFrontmatterEntry,
  type MarkdownFrontmatterResult,
} from './code-viewer-markdown'
export {
  type FileDiff,
  splitDiffByFile,
  type LineRange,
  type DiffLineRanges,
  parseDiffToLineRanges,
} from './code-viewer-diff'

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', css: 'css', scss: 'scss',
  html: 'html', xml: 'xml', py: 'python', rb: 'ruby',
  rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
  h: 'c', hpp: 'cpp', sh: 'shell', bash: 'shell', zsh: 'shell',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', sql: 'sql',
  graphql: 'graphql', dockerfile: 'dockerfile',
  makefile: 'plaintext', gitignore: 'plaintext',
}

export function extensionToLanguage(filePath: string | null): string {
  if (!filePath) return 'plaintext'
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_MAP[ext] ?? 'plaintext'
}

export function isMarkdownFile(filePath: string | null): boolean {
  if (!filePath) return false
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'md' || ext === 'mdx' || ext === 'markdown'
}

export function isHtmlFile(filePath: string | null): boolean {
  if (!filePath) return false
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'html' || ext === 'htm'
}

// Must stay in sync with mimeTypeForFile in src/main/ipc/file-handlers.ts.
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'apng',
])

export function isImageFile(filePath: string | null): boolean {
  if (!filePath) return false
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.has(ext)
}
