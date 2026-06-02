import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { migrateSuperagentsToWorkspaces } from './workspace-migration'

describe('migrateSuperagentsToWorkspaces', () => {
  let dir: string
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-migrate-')) })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('does nothing when there is no superagents file', () => {
    migrateSuperagentsToWorkspaces(path.join(dir, 'superagents.json'), path.join(dir, 'workspaces.json'))
    expect(fs.existsSync(path.join(dir, 'workspaces.json'))).toBe(false)
  })

  it('does not overwrite an existing workspaces file', () => {
    fs.writeFileSync(path.join(dir, 'superagents.json'), JSON.stringify([{ id: 's1', name: 'a', fleetProjectIds: ['p1'] }]))
    fs.writeFileSync(path.join(dir, 'workspaces.json'), '[]')
    migrateSuperagentsToWorkspaces(path.join(dir, 'superagents.json'), path.join(dir, 'workspaces.json'))
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'workspaces.json'), 'utf-8'))).toEqual([])
  })

  it('converts superagents into workspaces', () => {
    fs.writeFileSync(path.join(dir, 'superagents.json'), JSON.stringify([
      { id: 's1', name: 'auth', fleetProjectIds: ['p1', 'p2'], createdAt: '2026-04-18T00:00:00.000Z' },
      { id: 's2', name: 'logs', fleetProjectIds: ['p3'] },
    ]))
    migrateSuperagentsToWorkspaces(path.join(dir, 'superagents.json'), path.join(dir, 'workspaces.json'))
    const result = JSON.parse(fs.readFileSync(path.join(dir, 'workspaces.json'), 'utf-8'))
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 's1', name: 'auth', projectIds: ['p1', 'p2'] })
    expect(result[1]).toMatchObject({ id: 's2', name: 'logs', projectIds: ['p3'] })
  })

  it('tolerates a malformed superagents file', () => {
    fs.writeFileSync(path.join(dir, 'superagents.json'), 'not json')
    expect(() => migrateSuperagentsToWorkspaces(path.join(dir, 'superagents.json'), path.join(dir, 'workspaces.json'))).not.toThrow()
    expect(fs.existsSync(path.join(dir, 'workspaces.json'))).toBe(false)
  })
})
