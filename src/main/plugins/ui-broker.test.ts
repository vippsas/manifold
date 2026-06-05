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
})
