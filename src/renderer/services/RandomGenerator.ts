import type { CharacterDNA } from '../../shared/types/dna'
import type { SlotDefinition } from '../../shared/types/slot'
import type { AssetEntry } from '../../shared/types/asset'
import type { Rule } from '../../shared/types/rule'
import { evaluateRules } from '../../shared/rules/engine'
import type { BodyShape } from '../../shared/types/bodyShape'
import type { FaceShape } from '../../shared/types/faceShape'

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

  const shape = randomBodyShape(rng)
  dna.bodyShape = shape

  // bust/butt correlate with body shape and skew low so most bodies stay neutral
  const bustBias = shape.hipWidth > 1.04 ? 1.2 : 1.9
  dna.morphs.bust = Math.round(Math.pow(rng.next(), bustBias) * 100) / 100
  dna.morphs.butt = Math.round((0.2 + 0.8 * Math.pow(rng.next(), 1.4)) * 100) / 100

  dna.face = randomFaceShape(rng)

  for (const matId of MATERIAL_IDS) {
    const palette = params.palettes[matId]
    if (palette && palette.colors.length > 0) {
      dna.colors[matId] = rng.pick(palette.colors)
    }
  }

  return dna
}

interface Archetype {
  headWidth: number
  headHeight: number
  headLength: number
  jawChin: number
  shoulderWidth: number
  chestDepth: number
  waistTaper: number
  hipWidth: number
}

const ARCHETYPES: Archetype[] = [
  // slim
  { headWidth: 0.235, headHeight: 0.225, headLength: 0.25, jawChin: 0.5, shoulderWidth: 0.9, chestDepth: 0.88, waistTaper: 0.85, hipWidth: 0.95 },
  // average
  { headWidth: 0.25, headHeight: 0.22, headLength: 0.26, jawChin: 0.35, shoulderWidth: 1.0, chestDepth: 1.0, waistTaper: 1.0, hipWidth: 1.0 },
  // stocky
  { headWidth: 0.27, headHeight: 0.21, headLength: 0.27, jawChin: 0.45, shoulderWidth: 1.12, chestDepth: 1.12, waistTaper: 1.18, hipWidth: 1.08 }
]

function noise(rng: SeededPRNG, amount = 0.05): number {
  return (rng.next() * 2 - 1) * amount
}

function randomBodyShape(rng: SeededPRNG): BodyShape {
  const roll = rng.next()
  const base = roll < 0.3 ? ARCHETYPES[0] : roll < 0.68 ? ARCHETYPES[1] : ARCHETYPES[2]
  return {
    headWidth: Math.round((base.headWidth + noise(rng)) * 1000) / 1000,
    headHeight: Math.round((base.headHeight + noise(rng, 0.03)) * 1000) / 1000,
    headLength: Math.round((base.headLength + noise(rng)) * 1000) / 1000,
    jawChin: Math.max(0, Math.min(1, base.jawChin + noise(rng, 0.2))),
    shoulderWidth: Math.round((base.shoulderWidth + noise(rng)) * 1000) / 1000,
    chestDepth: Math.round((base.chestDepth + noise(rng)) * 1000) / 1000,
    waistTaper: Math.round((base.waistTaper + noise(rng)) * 1000) / 1000,
    hipWidth: Math.round((base.hipWidth + noise(rng)) * 1000) / 1000
  }
}

interface ExpressionMood {
  browTilt: number
  browHeight: number
  mouthCurve: number
}

const MOODS: Array<{ weight: number; mood: ExpressionMood }> = [
  { weight: 0.4, mood: { browTilt: -0.15, browHeight: 1.05, mouthCurve: 0.65 } },
  { weight: 0.3, mood: { browTilt: 0, browHeight: 1.0, mouthCurve: 0.15 } },
  { weight: 0.18, mood: { browTilt: 0.55, browHeight: 0.9, mouthCurve: -0.35 } },
  { weight: 0.12, mood: { browTilt: -0.6, browHeight: 1.15, mouthCurve: -0.45 } }
]

function pickMood(rng: SeededPRNG): ExpressionMood {
  const roll = rng.next()
  let acc = 0
  for (const { weight, mood } of MOODS) {
    acc += weight
    if (roll <= acc) return mood
  }
  return MOODS[0].mood
}

function randomFaceShape(rng: SeededPRNG): FaceShape {
  const mood = pickMood(rng)
  const jitter = (amount: number) => noise(rng, amount)
  return {
    eyeScale: Math.round((1 + jitter(0.22)) * 100) / 100,
    eyeSpacing: Math.round((1 + jitter(0.14)) * 100) / 100,
    browTilt: Math.max(-1, Math.min(1, Math.round((mood.browTilt + jitter(0.25)) * 100) / 100)),
    browHeight: Math.max(0.8, Math.min(1.25, Math.round((mood.browHeight + jitter(0.1)) * 100) / 100)),
    mouthCurve: Math.max(-1, Math.min(1, Math.round((mood.mouthCurve + jitter(0.3)) * 100) / 100)),
    mouthWidth: Math.round((1 + jitter(0.16)) * 100) / 100,
    noseSize: Math.round((1 + jitter(0.25)) * 100) / 100
  }
}
