export type FileOpenSource = 'default' | 'fileTree' | 'markdownPreview' | 'search' | 'memory'

export interface FileOpenRequest {
  path: string | null
  line?: number
  column?: number
  source: FileOpenSource
}
