import { describe, it, expect } from 'vitest'
import { createDNA, setSlot, setMorph, setColor, applyPreset } from './mutations'
import { CURRENT_DNA_VERSION } from '../types/dna'
import type { CharacterDNA } from '../types/dna'
import type { Preset } from '../types/preset'

function makeTestDNA(name = 'TestChar'): CharacterDNA {
  return createDNA(name)
}

describe('createDNA', () => {
  it('creates a valid DNA with given name', () => {
    const dna = createDNA('Hero')
    expect(dna.name).toBe('Hero')
    expect(dna.version).toBe(CURRENT_DNA_VERSION)
    expect(dna.slots).toEqual({})
    expect(dna.morphs).toEqual({})
    expect(dna.colors).toEqual({})
    expect(dna.metadata.created).toBeTruthy()
    expect(dna.metadata.modified).toBeTruthy()
  })

  it('sets created and modified to the same timestamp on creation', () => {
    const dna = createDNA('Test')
    expect(dna.metadata.created).toBe(dna.metadata.modified)
  })
})

describe('setSlot', () => {
  it('returns a new reference', () => {
    const dna = makeTestDNA()
    const result = setSlot(dna, 'hair', 'hair_01')
    expect(result).not.toBe(dna)
  })

  it('does not mutate the original', () => {
    const dna = makeTestDNA()
    setSlot(dna, 'hair', 'hair_01')
    expect(dna.slots).not.toHaveProperty('hair')
  })

  it('sets a slot value', () => {
    const dna = makeTestDNA()
    const result = setSlot(dna, 'hair', 'hair_01')
    expect(result.slots.hair).toBe('hair_01')
  })

  it('overwrites an existing slot value', () => {
    const dna = setSlot(makeTestDNA(), 'hair', 'hair_01')
    const result = setSlot(dna, 'hair', 'hair_02')
    expect(result.slots.hair).toBe('hair_02')
  })

  it('sets null to clear a slot', () => {
    const dna = setSlot(makeTestDNA(), 'hair', 'hair_01')
    const result = setSlot(dna, 'hair', null)
    expect(result.slots.hair).toBeNull()
  })

  it('carries over other fields unchanged', () => {
    const dna = setColor(makeTestDNA(), 'skin', '#FFDDCC')
    const result = setSlot(dna, 'hat', 'crown')
    expect(result.colors.skin).toBe('#FFDDCC')
  })

  it('creates a new metadata object (immutable)', () => {
    const dna = makeTestDNA()
    const result = setSlot(dna, 'hair', 'hair_01')
    expect(result.metadata).not.toBe(dna.metadata)
  })
})

describe('setMorph', () => {
  it('returns a new reference', () => {
    const dna = makeTestDNA()
    const result = setMorph(dna, 'noseWidth', 0.5)
    expect(result).not.toBe(dna)
  })

  it('sets a morph value', () => {
    const dna = makeTestDNA()
    const result = setMorph(dna, 'noseWidth', 0.5)
    expect(result.morphs.noseWidth).toBe(0.5)
  })

  it('clamps values below 0 to 0', () => {
    const dna = makeTestDNA()
    const result = setMorph(dna, 'noseWidth', -0.5)
    expect(result.morphs.noseWidth).toBe(0)
  })

  it('clamps values above 1 to 1', () => {
    const dna = makeTestDNA()
    const result = setMorph(dna, 'noseWidth', 1.5)
    expect(result.morphs.noseWidth).toBe(1)
  })

  it('does not mutate the original', () => {
    const dna = makeTestDNA()
    setMorph(dna, 'noseWidth', 0.5)
    expect(dna.morphs).not.toHaveProperty('noseWidth')
  })

  it('carries over other morphs when setting a new one', () => {
    const dna = setMorph(makeTestDNA(), 'eyeSize', 0.3)
    const result = setMorph(dna, 'jawWidth', 0.7)
    expect(result.morphs.eyeSize).toBe(0.3)
    expect(result.morphs.jawWidth).toBe(0.7)
  })
})

describe('setColor', () => {
  it('returns a new reference', () => {
    const dna = makeTestDNA()
    const result = setColor(dna, 'skin', '#FFDDCC')
    expect(result).not.toBe(dna)
  })

  it('sets a hex color string', () => {
    const dna = makeTestDNA()
    const result = setColor(dna, 'skin', '#FFDDCC')
    expect(result.colors.skin).toBe('#FFDDCC')
  })

  it('does not mutate the original', () => {
    const dna = makeTestDNA()
    setColor(dna, 'skin', '#FFDDCC')
    expect(dna.colors).not.toHaveProperty('skin')
  })

  it('overwrites an existing color', () => {
    const dna = setColor(makeTestDNA(), 'hair', '#000000')
    const result = setColor(dna, 'hair', '#FFFFFF')
    expect(result.colors.hair).toBe('#FFFFFF')
  })

  it('carries over other fields', () => {
    const dna = setSlot(makeTestDNA(), 'hair', 'hair_01')
    const result = setColor(dna, 'skin', '#FFDDCC')
    expect(result.slots.hair).toBe('hair_01')
  })
})

describe('applyPreset', () => {
  it('merges preset sockets, morphs, and colors onto existing DNA', () => {
    const dna = setSlot(createDNA('Hero'), 'hair', 'ponytail_01')
    const preset: Preset = {
      id: 'knight',
      name: 'Knight',
      description: '',
      icon: '',
      slots: { helmet: 'steel_helm' },
      morphs: { shoulderWidth: 0.8 },
      colors: { metal: '#a0a0a0' }
    }
    const result = applyPreset(dna, preset)
    expect(result.slots.hair).toBe('ponytail_01')
    expect(result.slots.helmet).toBe('steel_helm')
    expect(result.morphs.shoulderWidth).toBe(0.8)
    expect(result.colors.metal).toBe('#a0a0a0')
  })

  it('preserves fields not in the preset', () => {
    const dna = setColor(createDNA('Hero'), 'skin', '#FFDDCC')
    const preset: Preset = {
      id: 'knight',
      name: 'Knight',
      description: '',
      icon: '',
      morphs: { shoulderWidth: 0.8 }
    }
    const result = applyPreset(dna, preset)
    expect(result.colors.skin).toBe('#FFDDCC')
    expect(result.morphs.shoulderWidth).toBe(0.8)
  })

  it('returns a new reference', () => {
    const dna = createDNA('Hero')
    const preset: Preset = {
      id: 'test',
      name: 'Test',
      description: '',
      icon: '',
      colors: { skin: '#000' }
    }
    const result = applyPreset(dna, preset)
    expect(result).not.toBe(dna)
  })

  it('does not mutate the original', () => {
    const dna = createDNA('Hero')
    const preset: Preset = {
      id: 'test',
      name: 'Test',
      description: '',
      icon: '',
      colors: { skin: '#000' }
    }
    applyPreset(dna, preset)
    expect(dna.colors).not.toHaveProperty('skin')
  })

  it('handles empty preset gracefully', () => {
    const dna = setSlot(createDNA('Hero'), 'hair', 'ponytail')
    const preset: Preset = {
      id: 'empty',
      name: 'Empty',
      description: '',
      icon: ''
    }
    const result = applyPreset(dna, preset)
    expect(result.slots.hair).toBe('ponytail')
    expect(result).not.toBe(dna)
  })
})

describe('composed mutations', () => {
  it('applies multiple independent changes', () => {
    let dna = createDNA('Hero')
    dna = setSlot(dna, 'hair', 'ponytail_01')
    dna = setColor(dna, 'skin', '#F1D0B8')
    dna = setMorph(dna, 'eyeSize', 0.7)

    expect(dna.name).toBe('Hero')
    expect(dna.slots.hair).toBe('ponytail_01')
    expect(dna.colors.skin).toBe('#F1D0B8')
    expect(dna.morphs.eyeSize).toBe(0.7)
  })
})

describe('applyPreset bodyShape', () => {
  it('merges preset bodyShape over defaults and existing dna', () => {
    const base = setMorph(createDNA('Hero'), 'height', 0.7)
    const result = applyPreset(base, {
      id: 't', name: 'T', description: '', icon: '',
      morphs: { height: 0.2 },
      bodyShape: { shoulderWidth: 1.18, hipWidth: 1.15 }
    })
    expect(result.morphs.height).toBe(0.2)
    expect(result.bodyShape).toEqual({
      headWidth: 0.25, headHeight: 0.22, headLength: 0.26, jawChin: 0.35,
      shoulderWidth: 1.18, chestDepth: 1, waistTaper: 1, hipWidth: 1.15
    })
  })

  it('preserves existing bodyShape fields not overridden by preset', () => {
    const base = { ...createDNA('Hero'), bodyShape: { hipWidth: 1.3 } }
    const result = applyPreset(base, {
      id: 't', name: 'T', description: '', icon: '',
      bodyShape: { shoulderWidth: 0.9 }
    })
    expect(result.bodyShape?.hipWidth).toBe(1.3)
    expect(result.bodyShape?.shoulderWidth).toBe(0.9)
  })
})
