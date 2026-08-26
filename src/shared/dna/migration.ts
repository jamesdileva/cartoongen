import type { CharacterDNA } from '../types/dna'

export function migrateDNA(dna: CharacterDNA): CharacterDNA {
  if (dna.version === 1) {
    return { ...dna, version: 2 }
  }
  return dna
}
