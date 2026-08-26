import { describe, it, expect } from 'vitest'
import { generateRandomDNA } from './RandomGenerator'
import type { SlotDefinition } from '../../shared/types/slot'
import type { AssetEntry } from '../../shared/types/asset'
import type { Rule } from '../../shared/types/rule'

const testSlots: SlotDefinition[] = [
  { id: 'hair', label: 'Hair', boneAttachment: 'Head', layer: 1, allowedTags: ['hair'] },
  { id: 'shirt', label: 'Shirt', boneAttachment: 'Spine1', layer: 3, allowedTags: ['cloth'] }
]

const testAssets: AssetEntry[] = [
  { id: 'hair_01', slotId: 'hair', path: 'hair_01.glb', tags: ['hair', 'short'], version: 1, created: '' },
  { id: 'hair_02', slotId: 'hair', path: 'hair_02.glb', tags: ['hair', 'long'], version: 1, created: '' },
  { id: 'shirt_01', slotId: 'shirt', path: 'shirt_01.glb', tags: ['cloth'], version: 1, created: '' }
]

const testPalettes = {
  skin: { default: '#f5d0a9', colors: ['#f5d0a9', '#d4a574', '#8d5524'] },
  hair: { default: '#4a3728', colors: ['#000000', '#4a3728', '#ff0000'] },
  cloth: { default: '#8b4513', colors: ['#ff0000', '#00ff00', '#0000ff'] },
  metal: { default: '#c0c0c0', colors: ['#c0c0c0', '#ffd700'] },
  leather: { default: '#3e2723', colors: ['#3e2723', '#5d4037'] },
  eye: { default: '#ffffff', colors: ['#ffffff', '#00aa00'] }
}

const testRules: Rule[] = []

describe('generateRandomDNA', () => {
  it('returns a valid DNA object', () => {
    const dna = generateRandomDNA({ seed: 'test', slots: testSlots, assets: testAssets, palettes: testPalettes, rules: testRules })
    expect(dna).toHaveProperty('version', 1)
    expect(dna).toHaveProperty('name')
    expect(dna).toHaveProperty('slots')
    expect(dna).toHaveProperty('morphs')
    expect(dna).toHaveProperty('colors')
    expect(dna).toHaveProperty('metadata')
  })

  it('picks assets for available slots', () => {
    const dna = generateRandomDNA({ seed: 'test', slots: testSlots, assets: testAssets, palettes: testPalettes, rules: testRules })
    expect(dna.slots.hair).toBeTruthy()
    expect(dna.slots.shirt).toBeTruthy()
    expect(testAssets.find((a) => a.id === dna.slots.hair)).toBeTruthy()
  })

  it('sets null for slots with no assets', () => {
    const dna = generateRandomDNA({
      seed: 'test',
      slots: [{ id: 'helmet', label: 'Helmet', boneAttachment: 'Head', layer: 2, allowedTags: ['helmet'] }],
      assets: testAssets,
      palettes: testPalettes,
      rules: testRules
    })
    expect(dna.slots.helmet).toBeNull()
  })

  it('assigns morph values between 0 and 1', () => {
    const dna = generateRandomDNA({ seed: 'test', slots: testSlots, assets: testAssets, palettes: testPalettes, rules: testRules })
    for (const val of Object.values(dna.morphs)) {
      expect(val).toBeGreaterThanOrEqual(0)
      expect(val).toBeLessThanOrEqual(1)
    }
  })

  it('picks colors from available palettes', () => {
    const dna = generateRandomDNA({ seed: 'test', slots: testSlots, assets: testAssets, palettes: testPalettes, rules: testRules })
    for (const [matId, hex] of Object.entries(dna.colors)) {
      const palette = testPalettes[matId as keyof typeof testPalettes]
      if (palette) {
        expect(palette.colors).toContain(hex)
      }
    }
  })

  it('produces deterministic output for same seed', () => {
    const a = generateRandomDNA({ seed: 'repeatable', slots: testSlots, assets: testAssets, palettes: testPalettes, rules: testRules })
    const b = generateRandomDNA({ seed: 'repeatable', slots: testSlots, assets: testAssets, palettes: testPalettes, rules: testRules })
    expect(a.slots).toEqual(b.slots)
    expect(a.morphs).toEqual(b.morphs)
    expect(a.colors).toEqual(b.colors)
    expect(a.name).toEqual(b.name)
    expect(a.version).toEqual(b.version)
  })

  it('produces different output for different seeds', () => {
    const a = generateRandomDNA({ seed: 'alpha', slots: testSlots, assets: testAssets, palettes: testPalettes, rules: testRules })
    const b = generateRandomDNA({ seed: 'beta', slots: testSlots, assets: testAssets, palettes: testPalettes, rules: testRules })
    expect(a).not.toEqual(b)
  })

  it('resolves rules conflicts by clearing hidden slots', () => {
    const conflictRules: Rule[] = [
      {
        id: 'helmet-hides-hair',
        trigger: { slot: 'helmet' },
        conditions: [],
        actions: [{ type: 'hide_slot', target: 'hair' }]
      }
    ]
    const assetsWithHelmet: AssetEntry[] = [
      ...testAssets,
      { id: 'helmet_01', slotId: 'helmet', path: 'helmet_01.glb', tags: ['helmet'], version: 1, created: '' }
    ]
    const slotsWithHelmet: SlotDefinition[] = [
      ...testSlots,
      { id: 'helmet', label: 'Helmet', boneAttachment: 'Head', layer: 2, allowedTags: ['helmet'] }
    ]
    const dna = generateRandomDNA({ seed: 'conflict', slots: slotsWithHelmet, assets: assetsWithHelmet, palettes: testPalettes, rules: conflictRules })
    if (dna.slots.helmet) {
      expect(dna.slots.hair).toBeNull()
    }
  })

  it('handles empty asset list', () => {
    const dna = generateRandomDNA({ seed: 'empty', slots: testSlots, assets: [], palettes: testPalettes, rules: testRules })
    expect(dna.slots.hair).toBeNull()
    expect(dna.slots.shirt).toBeNull()
  })

  it('sets name from seed prefix', () => {
    const dna = generateRandomDNA({ seed: 'abc123', slots: testSlots, assets: testAssets, palettes: testPalettes, rules: testRules })
    expect(dna.name).toContain('abc123')
  })

  it('excludes opposite-gender assets when body is female', () => {
    const genderedAssets: AssetEntry[] = [
      { id: 'body_f', slotId: 'body', path: 'body_f.glb', tags: ['body', 'female', 'base_body'], version: 1, created: '' },
      { id: 'beard_01', slotId: 'beard', path: 'beard.glb', tags: ['beard', 'male'], version: 1, created: '' },
      { id: 'shirt_m', slotId: 'shirt', path: 'shirt_m.glb', tags: ['shirt', 'male'], version: 1, created: '' },
      { id: 'shirt_f', slotId: 'shirt', path: 'shirt_f.glb', tags: ['shirt', 'female'], version: 1, created: '' }
    ]
    const slotsWithBeard: SlotDefinition[] = [
      ...testSlots,
      { id: 'beard', label: 'Beard', boneAttachment: 'Head', layer: 1, allowedTags: ['beard'] }
    ]
    for (let i = 0; i < 20; i++) {
      const dna = generateRandomDNA({
        seed: `female-${i}`,
        slots: slotsWithBeard,
        assets: genderedAssets,
        palettes: testPalettes,
        rules: testRules,
        bodyAssetId: 'body_f'
      })
      expect(dna.slots.beard).toBeNull()
      if (dna.slots.shirt !== null) {
        expect(dna.slots.shirt).toBe('shirt_f')
      }
    }
  })

  it('excludes opposite-gender assets when body is male', () => {
    const genderedAssets: AssetEntry[] = [
      { id: 'body_m', slotId: 'body', path: 'body_m.glb', tags: ['body', 'male', 'base_body'], version: 1, created: '' },
      { id: 'hair_m', slotId: 'hair', path: 'hair_m.glb', tags: ['hair', 'male'], version: 1, created: '' },
      { id: 'hair_f', slotId: 'hair', path: 'hair_f.glb', tags: ['hair', 'female'], version: 1, created: '' },
      { id: 'hair_both', slotId: 'hair', path: 'hair_b.glb', tags: ['hair', 'male', 'female'], version: 1, created: '' }
    ]
    for (let i = 0; i < 20; i++) {
      const dna = generateRandomDNA({
        seed: `male-${i}`,
        slots: testSlots,
        assets: genderedAssets,
        palettes: testPalettes,
        rules: testRules,
        bodyAssetId: 'body_m'
      })
      expect(dna.slots.hair).not.toBe('hair_f')
    }
  })

  it('includes untagged and both-gender assets regardless of body gender', () => {
    const mixedAssets: AssetEntry[] = [
      { id: 'body_f', slotId: 'body', path: 'body_f.glb', tags: ['body', 'female', 'base_body'], version: 1, created: '' },
      { id: 'hair_neutral', slotId: 'hair', path: 'hn.glb', tags: ['hair'], version: 1, created: '' },
      { id: 'shirt_f', slotId: 'shirt', path: 'sf.glb', tags: ['shirt', 'female'], version: 1, created: '' }
    ]
    let sawNeutral = false
    let sawFemaleShirt = false
    for (let i = 0; i < 30 && !(sawNeutral && sawFemaleShirt); i++) {
      const dna = generateRandomDNA({
        seed: `mix-${i}`,
        slots: testSlots,
        assets: mixedAssets,
        palettes: testPalettes,
        rules: testRules,
        bodyAssetId: 'body_f'
      })
      if (dna.slots.hair === 'hair_neutral') sawNeutral = true
      if (dna.slots.shirt === 'shirt_f') sawFemaleShirt = true
    }
    expect(sawNeutral).toBe(true)
    expect(sawFemaleShirt).toBe(true)
  })

  it('does not filter when body has no gender tag or is missing', () => {
    const genderedAssets: AssetEntry[] = [
      { id: 'beard_01', slotId: 'beard', path: 'beard.glb', tags: ['beard', 'male'], version: 1, created: '' }
    ]
    const slotsWithBeard: SlotDefinition[] = [
      { id: 'beard', label: 'Beard', boneAttachment: 'Head', layer: 1, allowedTags: ['beard'] }
    ]
    // Unknown body asset id → no filtering
    const dna1 = generateRandomDNA({ seed: 'x', slots: slotsWithBeard, assets: genderedAssets, palettes: testPalettes, rules: testRules, bodyAssetId: 'unknown_body' })
    expect(dna1.slots.beard).toBe('beard_01')
    // No bodyAssetId at all → no filtering
    const dna2 = generateRandomDNA({ seed: 'x', slots: slotsWithBeard, assets: genderedAssets, palettes: testPalettes, rules: testRules })
    expect(dna2.slots.beard).toBe('beard_01')
  })
})
