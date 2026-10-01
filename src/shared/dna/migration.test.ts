import { describe, it, expect } from 'vitest'
import { migrateDNA } from './migration'
import { createDNA } from './mutations'
import { CURRENT_DNA_VERSION } from '../types/dna'

describe('migrateDNA', () => {
  it('upgrades version 1 through the chain to current', () => {
    const dna = { ...createDNA('Test'), version: 1 }
    const result = migrateDNA(dna)
    expect(result.version).toBe(CURRENT_DNA_VERSION)
    expect(result.version).toBe(4)
    expect(result.name).toBe('Test')
  })

  it('upgrades version 2 to current', () => {
    const dna = { ...createDNA('Test'), version: 2 }
    const result = migrateDNA(dna)
    expect(result.version).toBe(CURRENT_DNA_VERSION)
  })

  it('upgrades version 3 to 4 with default face styles', () => {
    const dna = { ...createDNA('Test'), version: 3, face: { noseSize: 1.2 } }
    const result = migrateDNA(dna)
    expect(result.version).toBe(4)
    // Styles absent pre-v4 render as defaults; stored face untouched.
    expect(result.face).toEqual({ noseSize: 1.2 })
  })

  it('leaves current-version DNA untouched', () => {
    const dna = createDNA('Test')
    expect(dna.version).toBe(CURRENT_DNA_VERSION)
    const result = migrateDNA(dna)
    expect(result.version).toBe(CURRENT_DNA_VERSION)
  })
})
