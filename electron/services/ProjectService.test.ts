import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProjectService } from './ProjectService'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cartoongen-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('ProjectService', () => {
  it('creates a project with the expected folder structure', async () => {
    const svc = await ProjectService.create(tmpDir, 'TestProject')
    const manifest = svc.getManifest()

    expect(manifest.name).toBe('TestProject')
    expect(manifest.version).toBe(1)
  })

  it('opens an existing project', async () => {
    await ProjectService.create(tmpDir, 'TestProject')
    const svc = await ProjectService.open(tmpDir)
    expect(svc.getManifest().name).toBe('TestProject')
  })

  it('lists character names from the characters directory', async () => {
    const svc = await ProjectService.create(tmpDir, 'TestProject')
    const names = await svc.listCharacterNames()
    expect(names).toEqual([])
  })

  it('rejects invalid project on open', async () => {
    await expect(ProjectService.open(tmpDir)).rejects.toThrow()
  })

  it('lists assets from the asset index', async () => {
    const svc = await ProjectService.create(tmpDir, 'TestProject')
    const assets = await svc.listAssets()
    expect(assets).toEqual([])
  })

  it('provides correct character file paths', async () => {
    const svc = await ProjectService.create(tmpDir, 'TestProject')
    const charPath = svc.characterPath('MyHero')
    expect(charPath).toContain('MyHero.character.json')
  })

  it('creates all expected subdirectories', async () => {
    await ProjectService.create(tmpDir, 'TestProject')
    const { readdirSync } = await import('node:fs')
    const entries = readdirSync(tmpDir)
    expect(entries).toContain('project.json')
    expect(entries).toContain('characters')
    expect(entries).toContain('assets')
    expect(entries).toContain('thumbnails')
  })
})
