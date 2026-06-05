import { describe, expect, it } from 'vitest'
import { UiRequestBroker } from './ui-broker'

describe('UiRequestBroker', () => {
  it('sends a ui-request and resolves when the matching response arrives', async () => {
    const sent: unknown[] = []
    const broker = new UiRequestBroker(() => (ch, ...a) => { if (ch === 'plugins:ui-request') sent.push(a[0]) })
    const p = broker.request({ kind: 'inputBox', options: { prompt: 'name?' } })
    const req = sent[0] as { requestId: string; kind: string }
    expect(req.kind).toBe('inputBox')
    broker.resolve(req.requestId, 'Daisy')
    expect(await p).toBe('Daisy')
  })
  it('resolves undefined when no window is available', async () => {
    const broker = new UiRequestBroker(() => null)
    expect(await broker.request({ kind: 'message', level: 'info', message: 'hi', actions: [] })).toBeUndefined()
  })
  it('ignores unknown requestIds', () => {
    const broker = new UiRequestBroker(() => () => {})
    expect(() => broker.resolve('nope', 'x')).not.toThrow()
  })
  it('flush() resolves all pending requests to undefined', async () => {
    const broker = new UiRequestBroker(() => () => {})
    const a = broker.request({ kind: 'inputBox', options: {} })
    const b = broker.request({ kind: 'message', level: 'info', message: 'x', actions: [] })
    broker.flush()
    expect(await a).toBeUndefined()
    expect(await b).toBeUndefined()
    // after flush, a late resolve for an already-flushed id is a no-op
    expect(() => broker.resolve('ui1', 'late')).not.toThrow()
  })
})
