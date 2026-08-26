import type { CharacterDNA } from '../../shared/types/dna'
import type { SlotDefinition } from '../../shared/types/slot'
import type { AssetEntry } from '../../shared/types/asset'
import type { Rule } from '../../shared/types/rule'
import { evaluateRules } from '../../shared/rules/engine'

interface PaletteData {
  [category: string]: {
    default: string
    colors: string[]
  }
}

interface RandomGeneratorParams {
  seed: string
  slots: SlotDefinition[]
  assets: AssetEntry[]
  palettes: PaletteData
  rules: Rule[]
  /** Asset id of the body slot to preserve; its gender tag filters compatible assets. */
  bodyAssetId?: string | null
}

const MATERIAL_IDS = ['skin', 'hair', 'cloth', 'metal', 'leather', 'eye']

class SeededPRNG {
  private s: number

  constructor(seed: string) {
    this.s = 0
    for (let i = 0; i < seed.length; i++) {
      this.s = ((this.s << 5) - this.s + seed.charCodeAt(i)) | 0
    }
    this.s = Math.abs(this.s) || 1
  }

  next(): number {
    this.s = (this.s * 16807) % 2147483647
    return (this.s - 1) / 2147483646
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }
}

export function generateRandomDNA(params: RandomGeneratorParams): CharacterDNA {
  const rng = new SeededPRNG(params.seed)
  const now = new Date().toISOString()
  const dna: CharacterDNA = {
    version: 1,
    name: `Random_${params.seed.slice(0, 6)}`,
    slots: {},
    morphs: {},
    colors: {},
    metadata: { created: now, modified: now }
  }

  const optionalSlots = new Set(['beard', 'helmet', 'cape', 'wings', 'eyebrows', 'mouth', 'gloves'])

  // Gender compatibility: exclude assets explicitly tagged with the opposite gender.
  const bodyAsset = params.bodyAssetId
    ? params.assets.find((a) => a.id === params.bodyAssetId)
    : undefined
  const gender =
    bodyAsset?.tags?.includes('female') === true
      ? 'female'
      : bodyAsset?.tags?.includes('male') === true
        ? 'male'
        : undefined
  const oppositeGender = gender === 'female' ? 'male' : 'female'

  for (const slot of params.slots) {
    if (slot.id === 'body') continue
    let available = params.assets.filter((a) => a.slotId === slot.id)
    if (gender) {
      available = available.filter(
        (a) => !a.tags?.some((t) => t === oppositeGender)
      )
    }
    if (available.length === 0) {
      dna.slots[slot.id] = null
      continue
    }
    if (optionalSlots.has(slot.id)) {
      const pickable: (AssetEntry | null)[] = [...available, null]
      dna.slots[slot.id] = rng.pick(pickable)?.id ?? null
    } else {
      dna.slots[slot.id] = rng.pick(available).id
    }
  }

  const results = evaluateRules(dna, params.rules)
  for (const r of results) {
    if ((r.type === 'hide' || r.type === 'disable') && r.slotId) {
      dna.slots[r.slotId] = null
    }
  }

  const morphKeys = ['height', 'shoulderWidth', 'neckWidth', 'bellySize', 'headSize', 'legLength', 'armLength', 'muscleMass']
  for (const key of morphKeys) {
    dna.morphs[key] = Math.round(rng.next() * 100) / 100
  }

  // bust/butt skewed low so most random bodies stay neutral
  dna.morphs.bust = Math.round(Math.pow(rng.next(), 1.6) * 100) / 100
  dna.morphs.butt = Math.round((0.2 + 0.8 * Math.pow(rng.next(), 1.4)) * 100) / 100

  for (const matId of MATERIAL_IDS) {
    const palette = params.palettes[matId]
    if (palette && palette.colors.length > 0) {
      dna.colors[matId] = rng.pick(palette.colors)
    }
  }

  return dna
}
