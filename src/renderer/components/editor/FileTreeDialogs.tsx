import React from 'react'
import type { FileTreeNode } from '../../../shared/types'
import { treeStyles } from './FileTree.styles'
import { describeDropTarget } from './file-tree-drop'

interface FileTreeDialogsProps {
  pendingDelete: { path: string; name: string; isDirectory: boolean } | null
  onCancelDelete: () => void
  onConfirmDelete: () => void
  pendingBulkDelete: FileTreeNode[] | null
  onCancelBulkDelete: () => void
  onConfirmBulkDelete: () => void
  pendingOverwrite: { newPath: string; targetDir: string } | null
  onCancelOverwrite: () => void
  onConfirmOverwrite: () => void
}

/** The three confirmation dialogs the file tree can surface (single delete,
 *  bulk delete, drag-move overwrite). Split out to keep FileTree focused. */
export function FileTreeDialogs({
  pendingDelete, onCancelDelete, onConfirmDelete,
  pendingBulkDelete, onCancelBulkDelete, onConfirmBulkDelete,
  pendingOverwrite, onCancelOverwrite, onConfirmOverwrite,
}: FileTreeDialogsProps): React.JSX.Element {
  return (
    <>
      {pendingDelete && (
        <div style={treeStyles.dialogOverlay} onClick={onCancelDelete}>
          <div style={treeStyles.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={treeStyles.dialogTitle}>Delete {pendingDelete.isDirectory ? 'folder' : 'file'}</div>
            <div style={treeStyles.dialogMessage}>
              Are you sure you want to delete <strong>{pendingDelete.name}</strong>?
              {pendingDelete.isDirectory && ' This will delete all contents.'}
            </div>
            <div style={treeStyles.dialogActions}>
              <button style={treeStyles.dialogCancel} onClick={onCancelDelete}>Cancel</button>
              <button style={treeStyles.dialogConfirm} onClick={onConfirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {pendingBulkDelete && (
        <div style={treeStyles.dialogOverlay} onClick={onCancelBulkDelete}>
          <div style={treeStyles.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={treeStyles.dialogTitle}>Delete {pendingBulkDelete.length} items</div>
            <div style={treeStyles.dialogMessage}>
              Are you sure you want to delete <strong>{pendingBulkDelete.length} selected items</strong>?
              {pendingBulkDelete.some((n) => n.isDirectory) && ' Folders will be deleted with all contents.'}
            </div>
            <div style={treeStyles.dialogActions}>
              <button style={treeStyles.dialogCancel} onClick={onCancelBulkDelete}>Cancel</button>
              <button style={treeStyles.dialogConfirm} onClick={onConfirmBulkDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {pendingOverwrite && (
        <div style={treeStyles.dialogOverlay} onClick={onCancelOverwrite}>
          <div style={treeStyles.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={treeStyles.dialogTitle}>Replace existing item?</div>
            <div style={treeStyles.dialogMessage}>
              <strong>{describeDropTarget(pendingOverwrite.newPath)}</strong> already exists in{' '}
              <strong>{describeDropTarget(pendingOverwrite.targetDir)}</strong>. Replace it with the moved item?
            </div>
            <div style={treeStyles.dialogActions}>
              <button style={treeStyles.dialogCancel} onClick={onCancelOverwrite}>Cancel</button>
              <button style={treeStyles.dialogConfirm} onClick={onConfirmOverwrite}>Replace</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
