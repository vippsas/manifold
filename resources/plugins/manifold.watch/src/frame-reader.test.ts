import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { readFrameAsDataUrl, FramePathError } from './frame-reader'

let workDir: string
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00])

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-watch-'))
})
afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true })
})

describe('readFrameAsDataUrl', () => {
  it('returns a base64 data URL for a JPEG inside a manifold-watch workdir', () => {
    const framePath = path.join(workDir, 'frame_0001.jpg')
    fs.writeFileSync(framePath, JPEG_BYTES)
    const url = readFrameAsDataUrl(framePath)
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(url).toContain(JPEG_BYTES.toString('base64'))
  })

  it('rejects paths outside the manifold-watch tmp prefix', () => {
    const outside = path.join(os.tmpdir(), 'something-else', 'frame.jpg')
    expect(() => readFrameAsDataUrl(outside)).toThrow(FramePathError)
  })

  it('rejects unsupported extensions even inside a workdir', () => {
    const evil = path.join(workDir, 'secrets.txt')
    fs.writeFileSync(evil, 'not a jpeg')
    expect(() => readFrameAsDataUrl(evil)).toThrow(FramePathError)
  })

  it('rejects path traversal attempts that escape the prefix', () => {
    const escape = path.join(workDir, '..', '..', 'etc', 'passwd')
    expect(() => readFrameAsDataUrl(escape)).toThrow(FramePathError)
  })

  it('errors when the frame file is missing', () => {
    const missing = path.join(workDir, 'frame_9999.jpg')
    expect(() => readFrameAsDataUrl(missing)).toThrow(FramePathError)
  })

  it('also accepts .jpeg and .png extensions', () => {
    const jpeg = path.join(workDir, 'frame_0001.jpeg')
    const png = path.join(workDir, 'frame_0002.png')
    fs.writeFileSync(jpeg, JPEG_BYTES)
    fs.writeFileSync(png, JPEG_BYTES)
    expect(readFrameAsDataUrl(jpeg).startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(readFrameAsDataUrl(png).startsWith('data:image/png;base64,')).toBe(true)
  })
})
