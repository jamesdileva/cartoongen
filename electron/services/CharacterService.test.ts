import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProjectService } from './ProjectService'
import { CharacterService } from './CharacterService'
import { createDNA, setSlot, setColor } from '../../src/shared/dna/mutations'

let tmpDir: string
let characterService: CharacterService

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cartoongen-test-char-'))
  await ProjectService.create(tmpDir, 'CharTest')
  characterService = new CharacterService(tmpDir)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('CharacterService', () => {
  it('saves and loads a character with round-trip equality', async () => {
    let dna = createDNA('Hero')
    dna = setSlot(dna, 'hair', 'ponytail_01')
    dna = setColor(dna, 'skin', '#F1D0B8')

    await characterService.save(dna)

    const loaded = await characterService.load('Hero')
    expect(loaded.name).toBe('Hero')
    expect(loaded.slots.hair).toBe('ponytail_01')
    expect(loaded.colors.skin).toBe('#F1D0B8')
  })

  it('lists saved character names', async () => {
    const dna1 = createDNA('Hero')
    const dna2 = createDNA('Sidekick')

    await characterService.save(dna1)
    await characterService.save(dna2)

    const names = await characterService.listNames()
    expect(names).toContain('Hero')
    expect(names).toContain('Sidekick')
  })

  it('deletes a character', async () => {
    const dna = createDNA('TempChar')
    await characterService.save(dna)

    let names = await characterService.listNames()
    expect(names).toContain('TempChar')

    await characterService.delete('TempChar')

    names = await characterService.listNames()
    expect(names).not.toContain('TempChar')
  })

  it('throws when loading a non-existent character', async () => {
    await expect(characterService.load('NoOne')).rejects.toThrow()
  })

  it('persists metadata across save/load', async () => {
    const dna = createDNA('Updater')
    await characterService.save(dna)
    const loaded = await characterService.load('Updater')

    expect(loaded.metadata.created).toBeTruthy()
    expect(loaded.metadata.modified).toBeTruthy()
  })

  it('multiple characters exist independently', async () => {
    const hero = setSlot(createDNA('Hero'), 'hair', 'short')
    const sidekick = setSlot(createDNA('Sidekick'), 'hair', 'long')

    await characterService.save(hero)
    await characterService.save(sidekick)

    const loadedHero = await characterService.load('Hero')
    const loadedSide = await characterService.load('Sidekick')

    expect(loadedHero.slots.hair).toBe('short')
    expect(loadedSide.slots.hair).toBe('long')
  })
})
