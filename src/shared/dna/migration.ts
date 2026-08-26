import type { CharacterDNA } from '../types/dna'

export function migrateDNA(dna: CharacterDNA): CharacterDNA {
  let out = dna
  if (out.version === 1) {
    out = { ...out, version: 2 }
  }
  if (out.version === 2) {
    out = { ...out, version: 3 }
  }
  return out
}
