import type { CharacterDNA } from '../types/dna'

export function migrateDNA(dna: CharacterDNA): CharacterDNA {
  let out = dna
  if (out.version === 1) {
    out = { ...out, version: 2 }
  }
  if (out.version === 2) {
    out = { ...out, version: 3 }
  }
  if (out.version === 3) {
    // Face styles default via mergeFaceShape/sanitizeFaceShape at render;
    // the bump marks saves that predate the style fields.
    out = { ...out, version: 4 }
  }
  return out
}
