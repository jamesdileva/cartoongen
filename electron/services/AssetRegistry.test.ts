import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AssetRegistry } from './AssetRegistry'
import type { AssetEntry } from '../../src/shared/types/asset'

let tmpDir: string
let indexPath: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cartoongen-test-asset-'))
  indexPath = join(tmpDir, 'index.json')
  writeFileSync(indexPath, JSON.stringify([], null, 2))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

const hairEntry: AssetEntry = {
  id: 'hair_short_01',
  slotId: 'hair',
  path: 'assets/meshes/hair_short_01.glb',
  tags: ['male', 'short', 'cartoon'],
  version: 1,
  created: new Date().toISOString()
}

const helmetEntry: AssetEntry = {
  id: 'helmet_knight_01',
  slotId: 'helmet',
  path: 'assets/meshes/helmet_knight_01.glb',
  tags: ['male', 'heavy', 'fantasy'],
  version: 1,
  created: new Date().toISOString()
}

describe('AssetRegistry', () => {
  it('returns empty array for empty registry', async () => {
    const registry = await AssetRegistry.create(indexPath)
    const results = await registry.query()
    expect(results).toEqual([])
  })

  it('registers and queries by slot', async () => {
    const registry = await AssetRegistry.create(indexPath)
    await registry.register(hairEntry)
    await registry.register(helmetEntry)

    const hairResults = await registry.query({ slotId: 'hair' })
    expect(hairResults).toHaveLength(1)
    expect(hairResults[0].id).toBe('hair_short_01')

    const helmetResults = await registry.query({ slotId: 'helmet' })
    expect(helmetResults).toHaveLength(1)
    expect(helmetResults[0].id).toBe('helmet_knight_01')
  })

  it('filters by tags (intersection)', async () => {
    const registry = await AssetRegistry.create(indexPath)
    await registry.register(hairEntry)

    const results = await registry.query({ tags: ['male'] })
    expect(results).toHaveLength(1)

    const noResults = await registry.query({ tags: ['female'] })
    expect(noResults).toHaveLength(0)
  })

  it('filters by multiple tags with AND logic', async () => {
    const registry = await AssetRegistry.create(indexPath)
    await registry.register(hairEntry)

    const results = await registry.query({ tags: ['male', 'short'] })
    expect(results).toHaveLength(1)

    const noResults = await registry.query({ tags: ['male', 'long'] })
    expect(noResults).toHaveLength(0)
  })

  it('filters by ids', async () => {
    const registry = await AssetRegistry.create(indexPath)
    await registry.register(hairEntry)
    await registry.register(helmetEntry)

    const results = await registry.query({ ids: ['hair_short_01'] })
    expect(results).toHaveLength(1)
  })

  it('gets entry by id', async () => {
    const registry = await AssetRegistry.create(indexPath)
    await registry.register(hairEntry)

    const result = await registry.getById('hair_short_01')
    expect(result).toBeDefined()
    expect(result!.slotId).toBe('hair')
  })

  it('returns undefined for missing id', async () => {
    const registry = await AssetRegistry.create(indexPath)
    const result = await registry.getById('nonexistent')
    expect(result).toBeUndefined()
  })

  it('unregisters an entry', async () => {
    const registry = await AssetRegistry.create(indexPath)
    await registry.register(hairEntry)
    await registry.unregister('hair_short_01')

    const result = await registry.getById('hair_short_01')
    expect(result).toBeUndefined()
  })

  it('persists entries to disk', async () => {
    const registry = await AssetRegistry.create(indexPath)
    await registry.register(hairEntry)

    const registry2 = await AssetRegistry.create(indexPath)
    const results = await registry2.query()
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('hair_short_01')
  })

  it('updates an existing entry on re-register', async () => {
    const registry = await AssetRegistry.create(indexPath)
    await registry.register(hairEntry)

    const updated: AssetEntry = { ...hairEntry, tags: ['updated'] }
    await registry.register(updated)

    const result = await registry.getById('hair_short_01')
    expect(result!.tags).toEqual(['updated'])
  })
})
