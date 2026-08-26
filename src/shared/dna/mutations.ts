import type { CharacterDNA } from '../types/dna'
import type { Preset } from '../types/preset'
import { CURRENT_DNA_VERSION } from '../types/dna'

export function createDNA(name: string): CharacterDNA {
  const now = new Date().toISOString()
  return {
    version: CURRENT_DNA_VERSION,
    name,
    slots: {},
    morphs: {},
    colors: {},
    metadata: {
      created: now,
      modified: now
    }
  }
}

export function setSlot(dna: CharacterDNA, slotId: string, assetId: string | null): CharacterDNA {
  return {
    ...dna,
    slots: { ...dna.slots, [slotId]: assetId },
    metadata: { ...dna.metadata, modified: new Date().toISOString() }
  }
}

export function setMorph(dna: CharacterDNA, morphName: string, value: number): CharacterDNA {
  const clamped = Math.max(0, Math.min(1, value))
  return {
    ...dna,
    morphs: { ...dna.morphs, [morphName]: clamped },
    metadata: { ...dna.metadata, modified: new Date().toISOString() }
  }
}

export function setColor(dna: CharacterDNA, materialId: string, hex: string): CharacterDNA {
  return {
    ...dna,
    colors: { ...dna.colors, [materialId]: hex },
    metadata: { ...dna.metadata, modified: new Date().toISOString() }
  }
}

export function applyPreset(dna: CharacterDNA, preset: Preset): CharacterDNA {
  const slots = preset.slots ? { ...dna.slots, ...preset.slots } : dna.slots
  const morphs = preset.morphs ? { ...dna.morphs, ...preset.morphs } : dna.morphs
  const colors = preset.colors ? { ...dna.colors, ...preset.colors } : dna.colors
  return {
    ...dna,
    slots,
    morphs,
    colors,
    metadata: { ...dna.metadata, modified: new Date().toISOString() }
  }
}
