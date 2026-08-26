import { readFile, writeFile, unlink } from 'node:fs/promises'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { CharacterDNA } from '../../src/shared/types/dna'
import { migrateDNA } from '../../src/shared/dna/migration'

const CHARACTERS_DIR = 'characters'

export class CharacterService {
  constructor(private projectRoot: string) {}

  async save(dna: CharacterDNA): Promise<void> {
    const dnaToWrite: CharacterDNA = {
      ...dna,
      metadata: { ...dna.metadata, modified: new Date().toISOString() }
    }

    const filePath = join(this.projectRoot, CHARACTERS_DIR, `${dna.name}.character.json`)
    await writeFile(filePath, JSON.stringify(dnaToWrite, null, 2))
  }

  async load(name: string): Promise<CharacterDNA> {
    const filePath = join(this.projectRoot, CHARACTERS_DIR, `${name}.character.json`)
    const raw = await readFile(filePath, 'utf-8')
    const dna = JSON.parse(raw) as CharacterDNA

    if (!dna.name || !dna.version) {
      throw new Error(`Invalid character file: ${name}.character.json`)
    }

    return migrateDNA(dna)
  }

  async delete(name: string): Promise<void> {
    const filePath = join(this.projectRoot, CHARACTERS_DIR, `${name}.character.json`)
    await unlink(filePath)
  }

  async listNames(): Promise<string[]> {
    const dir = join(this.projectRoot, CHARACTERS_DIR)
    const entries = readdirSync(dir)
    return entries
      .filter((e) => e.endsWith('.character.json'))
      .map((e) => e.replace(/\.character\.json$/, ''))
      .sort()
  }
}
