import type { ManifoldContext, TreeItem, Disposable } from 'manifold'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifold = require('manifold') as typeof import('manifold')

type Node = { kind: 'counter' } | { kind: 'group'; label: string } | { kind: 'leaf'; label: string }

export function activate(context: ManifoldContext): void {
  let count = 0
  let fire: (() => void) | undefined
  const fruits: Node[] = [{ kind: 'leaf', label: 'Apple' }, { kind: 'leaf', label: 'Banana' }]

  const provider = {
    onDidChangeTreeData(listener: () => void): Disposable {
      fire = listener
      return { dispose: () => { fire = undefined } }
    },
    getChildren(element?: Node): Node[] {
      if (!element) return [{ kind: 'counter' }, { kind: 'group', label: 'Fruits' }]
      if (element.kind === 'group') return fruits
      return []
    },
    getTreeItem(element: Node): TreeItem {
      if (element.kind === 'counter') {
        return { label: `Counter: ${count}`, collapsibleState: 0, iconPath: 'database', tooltip: 'Click to increment', command: { command: 'manifold.hello-tree.inc' } }
      }
      if (element.kind === 'group') {
        return { label: element.label, collapsibleState: 1, iconPath: 'folder' }
      }
      return { label: element.label, collapsibleState: 0, iconPath: 'file' }
    },
  }

  context.subscriptions.push(manifold.window.registerTreeDataProvider('manifold.hello-tree.view', provider))
  context.subscriptions.push(manifold.commands.registerCommand('manifold.hello-tree.inc', () => {
    count += 1
    fire?.()
  }))
}

export function deactivate(): void {}
