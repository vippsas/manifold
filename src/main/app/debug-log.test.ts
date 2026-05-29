import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { DebugLogger } from './debug-log'

let baseDir: string
const logFile = () => path.join(baseDir, 'debug.log')
const read = () => {
  try {
    return fs.readFileSync(logFile(), 'utf8')
  } catch {
    return ''
  }
}

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debuglog-'))
})

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true })
})

describe('DebugLogger', () => {
  it('does NOT write synchronously on log() (the hot-path hang fix)', () => {
    const logger = new DebugLogger(logFile())
    logger.log('first line')
    logger.log('second line')
    // Nothing should have touched disk yet — writes are buffered + async.
    expect(read()).toBe('')
  })

  it('flushes buffered lines to disk asynchronously, in order', async () => {
    const logger = new DebugLogger(logFile())
    logger.log('alpha')
    logger.log('beta')
    await logger.flush()
    const contents = read()
    expect(contents).toContain('alpha\n')
    expect(contents).toContain('beta\n')
    expect(contents.indexOf('alpha')).toBeLessThan(contents.indexOf('beta'))
  })

  it('prefixes each line with an ISO timestamp', async () => {
    const logger = new DebugLogger(logFile())
    logger.log('hello')
    await logger.flush()
    expect(read()).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z hello\n/)
  })

  it('flushSync persists pending lines synchronously (quit path)', () => {
    const logger = new DebugLogger(logFile())
    logger.log('on-quit line')
    logger.flushSync()
    expect(read()).toContain('on-quit line\n')
  })

  it('appends to existing log content rather than overwriting', async () => {
    fs.writeFileSync(logFile(), 'pre-existing\n')
    const logger = new DebugLogger(logFile())
    logger.log('appended')
    await logger.flush()
    const contents = read()
    expect(contents).toContain('pre-existing\n')
    expect(contents).toContain('appended\n')
    expect(contents.indexOf('pre-existing')).toBeLessThan(contents.indexOf('appended'))
  })

  it('auto-flushes on its own debounce timer without an explicit flush call', async () => {
    const logger = new DebugLogger(logFile(), 10)
    logger.log('auto')
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(read()).toContain('auto\n')
  })

  it('coalesces many rapid logs into batched appends', async () => {
    const logger = new DebugLogger(logFile())
    for (let i = 0; i < 100; i++) logger.log(`line ${i}`)
    await logger.flush()
    const lines = read().trimEnd().split('\n')
    expect(lines).toHaveLength(100)
    expect(lines[0]).toContain('line 0')
    expect(lines[99]).toContain('line 99')
  })

  it('bounds the in-memory buffer if a flush never lands', () => {
    const logger = new DebugLogger(logFile())
    // Far more than the cap; should not grow unbounded in memory.
    for (let i = 0; i < 20000; i++) logger.log(`x ${i}`)
    logger.flushSync()
    const lines = read().trimEnd().split('\n')
    // Capped, and the most recent lines are the ones retained.
    expect(lines.length).toBeLessThanOrEqual(5000)
    expect(lines[lines.length - 1]).toContain('x 19999')
  })
})
