export type FileOpenSource = 'default' | 'fileTree' | 'markdownPreview'

export interface FileOpenRequest {
  path: string | null
  source: FileOpenSource
}
