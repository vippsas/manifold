export type FileOpenSource = 'default' | 'fileTree'

export interface FileOpenRequest {
  path: string | null
  source: FileOpenSource
}
