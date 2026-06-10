import * as fs from 'node:fs'

/**
 * Write a file atomically: serialize to a sibling `.tmp` file, then `rename` it
 * over the destination. `rename` is atomic on POSIX, so a crash mid-write leaves
 * the previous file intact instead of a truncated one that `loadFromDisk()` would
 * read as an empty default (data loss). Used by all whole-file JSON stores.
 */
export function writeFileAtomicSync(file: string, data: string): void {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, data, 'utf-8')
  fs.renameSync(tmp, file)
}
