// src/plugin-host/vscode-shim/types.ts
import { posix } from 'node:path'

/** Thrown when an extension calls a `vscode` API the shim does not yet implement. */
export class VscodeShimError extends Error {
  constructor(api: string) {
    super(`vscode.${api} is not yet implemented in Manifold's compatibility shim.`)
    this.name = 'VscodeShimError'
  }
}

/** Returns a function that throws a VscodeShimError when called. Use for the long tail. */
export function notImplemented(api: string): (...args: unknown[]) => never {
  return () => { throw new VscodeShimError(api) }
}

export class Disposable {
  private disposed = false
  constructor(private readonly callOnDispose: () => unknown) {}
  static from(...items: { dispose(): unknown }[]): Disposable {
    return new Disposable(() => { for (const i of items) { try { i.dispose() } catch { /* ignore */ } } })
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.callOnDispose()
  }
}

export class EventEmitter<T> {
  private readonly listeners = new Set<(e: T) => unknown>()
  readonly event = (listener: (e: T) => unknown): Disposable => {
    this.listeners.add(listener)
    return new Disposable(() => this.listeners.delete(listener))
  }
  fire(data: T): void { for (const l of [...this.listeners]) { try { l(data) } catch { /* ignore */ } } }
  dispose(): void { this.listeners.clear() }
}

/** Minimal Uri compatible with the members command-only extensions read. */
export class Uri {
  private constructor(
    readonly scheme: string,
    readonly authority: string,
    readonly path: string,
    readonly query: string,
    readonly fragment: string,
  ) {}
  get fsPath(): string { return this.path }
  static file(path: string): Uri { return new Uri('file', '', path, '', '') }
  static parse(value: string): Uri {
    const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(value)
    // Fallback: treat as a raw file path (handles plain paths and single-slash schemes not used by command-only extensions).
    if (!m) return new Uri('file', '', value, '', '')
    return new Uri(m[1], m[2] ?? '', m[3] ?? '', m[4] ?? '', m[5] ?? '')
  }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, base.authority, posix.join(base.path, ...segments), base.query, base.fragment)
  }
  with(change: { scheme?: string; path?: string }): Uri {
    return new Uri(change.scheme ?? this.scheme, this.authority, change.path ?? this.path, this.query, this.fragment)
  }
  toString(): string {
    const a = (this.authority || this.scheme === 'file') ? '//' + this.authority : ''
    return `${this.scheme}:${a}${this.path}${this.query ? '?' + this.query : ''}${this.fragment ? '#' + this.fragment : ''}`
  }
}

/** Enum-like constants extensions reference at module load. Calling unsupported
 *  *behavior* still throws via notImplemented; these just prevent eval-time crashes. */
export const enums = {
  ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  ExtensionMode: { Production: 1, Development: 2, Test: 3 },
  ExtensionKind: { UI: 1, Workspace: 2 },
  UIKind: { Desktop: 1, Web: 2 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  QuickPickItemKind: { Separator: -1, Default: 0 },
  ProgressLocation: { SourceControl: 1, Window: 10, Notification: 15 },
} as const
