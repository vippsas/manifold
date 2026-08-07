export type FileOpenSource = 'default' | 'fileTree' | 'markdownPreview' | 'search' | 'memory' | 'sourceControl'

/** Which workspace checkout a Source Control click came from — the editor
 *  fetches this file's uncommitted diff (`git:workspace-file-diff`) instead of
 *  reading the session's base-branch diff. */
export interface ScmFileTarget {
  workspaceId: string
  projectId: string
  relPath: string
  /** Which half of a staged-then-edited file was clicked: the staged row diffs
   *  the index against HEAD, the unstaged row the working tree against the
   *  index. */
  staged: boolean
}

export interface FileOpenRequest {
  path: string | null
  line?: number
  column?: number
  source: FileOpenSource
  /** Set only when source is 'sourceControl'. */
  scm?: ScmFileTarget
}
