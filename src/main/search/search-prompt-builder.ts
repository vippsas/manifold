import type { CodeSearchResult, FileSearchResult, MemorySearchResultItem, UnifiedSearchResult } from '../../shared/search-types'

export function buildSearchAnswerPrompt(question: string, citations: UnifiedSearchResult[]): string {
  const sourceBlocks = citations.map((citation, index) => formatSourceBlock(citation, index + 1))

  return [
    'You are answering a search question inside Manifold.',
    'Use only the grounded sources below.',
    'If the sources are insufficient, say so clearly.',
    'Cite supporting sources inline with square brackets like [S1] or [S2].',
    'Do not invent files, branches, code, or decisions not present in the sources.',
    '',
    `Question: ${question.trim()}`,
    '',
    'Sources:',
    sourceBlocks.join('\n\n'),
  ].join('\n')
}

export function buildSearchRerankPrompt(query: string, citations: UnifiedSearchResult[]): string {
  const sourceBlocks = citations.map((citation, index) => formatSourceBlock(citation, index + 1))

  return [
    'You are reranking search results inside Manifold.',
    'Rank the sources by relevance to the query.',
    'Return only source ids in order, separated by spaces.',
    'Example: S2 S1 S3',
    'Do not explain your answer.',
    '',
    `Query: ${query.trim()}`,
    '',
    'Sources:',
    sourceBlocks.join('\n\n'),
  ].join('\n')
}

function formatSourceBlock(result: UnifiedSearchResult, sourceIndex: number): string {
  const sourceId = `S${sourceIndex}`
  const metadata = formatMetadata(result)

  const body = result.source === 'code'
    ? formatCodeSnippet(result)
    : result.source === 'file'
      ? result.relativePath
      : result.snippet

  return [
    `[${sourceId}] ${metadata}`,
    body,
  ].join('\n')
}

function formatMetadata(result: UnifiedSearchResult): string {
  if (result.source === 'code') return formatCodeMetadata(result)
  if (result.source === 'file') return formatFileMetadata(result)
  return formatMemoryMetadata(result)
}

function formatFileMetadata(result: FileSearchResult): string {
  return ['File', result.relativePath, result.branchName, result.runtimeId]
    .filter(Boolean)
    .join(' | ')
}

function formatCodeMetadata(result: CodeSearchResult): string {
  const parts = [
    'Code',
    result.relativePath,
    `line ${result.line}`,
    result.branchName,
    result.runtimeId,
  ]

  return parts.filter(Boolean).join(' | ')
}

function formatMemoryMetadata(result: MemorySearchResultItem): string {
  const parts = [
    'Memory',
    result.memorySource,
    result.title,
    result.branchName,
    result.runtimeId,
  ]

  return parts.filter(Boolean).join(' | ')
}

function formatCodeSnippet(result: CodeSearchResult): string {
  const lines: string[] = []
  const beforeLines = result.contextBefore ?? []
  const afterLines = result.contextAfter ?? []

  beforeLines.forEach((line, index) => {
    lines.push(`${result.line - beforeLines.length + index}: ${line}`)
  })
  lines.push(`${result.line}: ${result.snippet}`)
  afterLines.forEach((line, index) => {
    lines.push(`${result.line + index + 1}: ${line}`)
  })

  return lines.join('\n')
}
