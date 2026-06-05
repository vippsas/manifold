import { describe, expect, it, vi } from 'vitest'
import { Disposable, EventEmitter, Uri, enums, notImplemented, VscodeShimError } from './types'

describe('vscode-shim types', () => {
  it('Disposable.from disposes all, and instances run their callback once', () => {
    const a = vi.fn(); const b = vi.fn()
    Disposable.from({ dispose: a }, { dispose: b }).dispose()
    expect(a).toHaveBeenCalledOnce(); expect(b).toHaveBeenCalledOnce()
    const cb = vi.fn(); const d = new Disposable(cb)
    d.dispose(); d.dispose()
    expect(cb).toHaveBeenCalledOnce()
  })

  it('Disposable.from swallows errors thrown by member disposables', () => {
    expect(() => Disposable.from({ dispose() { throw new Error('boom') } }).dispose()).not.toThrow()
  })

  it('EventEmitter fires listeners and stops after dispose of the subscription', () => {
    const e = new EventEmitter<number>(); const seen: number[] = []
    const sub = e.event((n) => seen.push(n))
    e.fire(1); sub.dispose(); e.fire(2)
    expect(seen).toEqual([1])
  })

  it('Uri.file exposes fsPath/path/scheme and round-trips toString', () => {
    const u = Uri.file('/tmp/x.txt')
    expect(u.scheme).toBe('file'); expect(u.fsPath).toBe('/tmp/x.txt')
    expect(Uri.joinPath(u, '..', 'y.txt').fsPath).toBe('/tmp/y.txt')
    expect(Uri.file('/tmp/x.txt').toString()).toBe('file:///tmp/x.txt')
  })

  it('Uri.parse decomposes scheme/path/query/fragment and round-trips toString', () => {
    const u = Uri.parse('https://host.com/path?q=1#frag')
    expect(u.scheme).toBe('https')
    expect(u.path).toBe('/path')
    expect(u.query).toBe('q=1')
    expect(u.fragment).toBe('frag')
    expect(u.toString()).toBe('https://host.com/path?q=1#frag')
  })

  it('Uri.with overrides path', () => {
    expect(Uri.file('/a').with({ path: '/b' }).fsPath).toBe('/b')
  })

  it('enums expose the constants extensions reference at module-eval', () => {
    expect(enums.ViewColumn.One).toBe(1)
    expect(enums.ConfigurationTarget.Global).toBe(1)
    expect(enums.TreeItemCollapsibleState.Collapsed).toBe(1)
  })

  it('notImplemented throws a named, descriptive error', () => {
    expect(() => notImplemented('window.createTreeView')()).toThrow(VscodeShimError)
    expect(() => notImplemented('window.createTreeView')()).toThrow(/createTreeView/)
  })
})
