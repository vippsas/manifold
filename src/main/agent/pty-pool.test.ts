import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockOnDataCallback: ((data: string) => void) | null = null
let mockOnExitCallback: ((info: { exitCode: number; signal?: number }) => void) | null = null

const mockPtyProcess = {
  pid: 12345,
  write: vi.fn(),
  kill: vi.fn(),
  resize: vi.fn(),
  onData: vi.fn((cb: (data: string) => void) => {
    mockOnDataCallback = cb
  }),
  onExit: vi.fn((cb: (info: { exitCode: number; signal?: number }) => void) => {
    mockOnExitCallback = cb
  }),
}

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPtyProcess),
}))

let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: vi.fn(() => `mock-uuid-${++uuidCounter}`),
}))

import { PtyPool } from './pty-pool'
import * as pty from 'node-pty'

describe('PtyPool', () => {
  let pool: PtyPool

  beforeEach(() => {
    vi.clearAllMocks()
    uuidCounter = 0
    mockOnDataCallback = null
    mockOnExitCallback = null
    pool = new PtyPool()
  })

  describe('spawn', () => {
    it('spawns a pty process and returns a handle', () => {
      const handle = pool.spawn('node', ['-e', '1'], { cwd: '/tmp' })

      expect(handle.id).toBe('mock-uuid-1')
      expect(handle.pid).toBe(12345)
      expect(pty.spawn).toHaveBeenCalledWith('node', ['-e', '1'], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: '/tmp',
        env: expect.objectContaining({}),
      })
    })

    it('merges custom env with process.env', () => {
      pool.spawn('sh', [], { cwd: '/tmp', env: { CUSTOM_VAR: 'yes' } })

      const callArgs = vi.mocked(pty.spawn).mock.calls[0][2]
      expect(callArgs.env).toHaveProperty('CUSTOM_VAR', 'yes')
    })

    it('tracks the pty in active list', () => {
      pool.spawn('sh', [], { cwd: '/tmp' })
      expect(pool.getActivePtyIds()).toContain('mock-uuid-1')
    })
  })

  describe('write', () => {
    it('writes data to an existing pty', () => {
      const handle = pool.spawn('sh', [], { cwd: '/tmp' })
      pool.write(handle.id, 'hello')
      expect(mockPtyProcess.write).toHaveBeenCalledWith('hello')
    })

    it('throws if pty not found', () => {
      expect(() => pool.write('non-existent', 'hello')).toThrow('PTY not found')
    })
  })

  describe('kill', () => {
    it('kills the process and removes it from the pool', () => {
      const handle = pool.spawn('sh', [], { cwd: '/tmp' })
      pool.kill(handle.id)
      expect(mockPtyProcess.kill).toHaveBeenCalled()
      expect(pool.getActivePtyIds()).not.toContain(handle.id)
    })

    it('does nothing if pty not found', () => {
      expect(() => pool.kill('non-existent')).not.toThrow()
    })
  })

  describe('resize', () => {
    it('resizes the pty terminal', () => {
      const handle = pool.spawn('sh', [], { cwd: '/tmp' })
      pool.resize(handle.id, 200, 50)
      expect(mockPtyProcess.resize).toHaveBeenCalledWith(200, 50)
    })

    it('throws if pty not found', () => {
      expect(() => pool.resize('non-existent', 80, 24)).toThrow('PTY not found')
    })
  })

  describe('onData', () => {
    it('registers a data listener and invokes it when data arrives', () => {
      const handle = pool.spawn('sh', [], { cwd: '/tmp' })
      const listener = vi.fn()
      pool.onData(handle.id, listener)

      // Simulate data arrival from the pty
      expect(mockOnDataCallback).toBeTruthy()
      mockOnDataCallback!('some output')

      expect(listener).toHaveBeenCalledWith('some output')
    })

    it('supports multiple data listeners', () => {
      const handle = pool.spawn('sh', [], { cwd: '/tmp' })
      const listener1 = vi.fn()
      const listener2 = vi.fn()
      pool.onData(handle.id, listener1)
      pool.onData(handle.id, listener2)

      mockOnDataCallback!('data')

      expect(listener1).toHaveBeenCalledWith('data')
      expect(listener2).toHaveBeenCalledWith('data')
    })

    it('throws if pty not found', () => {
      expect(() => pool.onData('non-existent', vi.fn())).toThrow('PTY not found')
    })
  })

  describe('onExit', () => {
    it('registers an exit listener and invokes it on exit', () => {
      const handle = pool.spawn('sh', [], { cwd: '/tmp' })
      const listener = vi.fn()
      pool.onExit(handle.id, listener)

      mockOnExitCallback!({ exitCode: 0, signal: undefined })

      expect(listener).toHaveBeenCalledWith(0, undefined)
    })

    it('removes pty from pool on exit', () => {
      const handle = pool.spawn('sh', [], { cwd: '/tmp' })
      pool.onExit(handle.id, vi.fn())

      mockOnExitCallback!({ exitCode: 1 })

      expect(pool.getActivePtyIds()).not.toContain(handle.id)
    })

    it('throws if pty not found', () => {
      expect(() => pool.onExit('non-existent', vi.fn())).toThrow('PTY not found')
    })
  })

  describe('killAll', () => {
    it('kills all active ptys', () => {
      pool.spawn('sh', [], { cwd: '/tmp' })
      pool.spawn('sh', [], { cwd: '/tmp' })
      pool.killAll()

      expect(pool.getActivePtyIds()).toHaveLength(0)
    })
  })

  describe('getActivePtyIds', () => {
    it('returns empty array initially', () => {
      expect(pool.getActivePtyIds()).toEqual([])
    })
  })
})
