import { describe, it, expect } from 'vitest'
import { migrateDNA } from './migration'
import { createDNA } from './mutations'
import { CURRENT_DNA_VERSION } from '../types/dna'

describe('migrateDNA', () => {
  it('upgrades version 1 through the chain to current', () => {
    const dna = { ...createDNA('Test'), version: 1 }
    const result = migrateDNA(dna)
    expect(result.version).toBe(CURRENT_DNA_VERSION)
    expect(result.version).toBe(3)
    expect(result.name).toBe('Test')
  })

  it('upgrades version 2 to current', () => {
    const dna = { ...createDNA('Test'), version: 2 }
    const result = migrateDNA(dna)
    expect(result.version).toBe(CURRENT_DNA_VERSION)
  })

  it('leaves current-version DNA untouched', () => {
    const dna = createDNA('Test')
    expect(dna.version).toBe(CURRENT_DNA_VERSION)
    const result = migrateDNA(dna)
    expect(result.version).toBe(CURRENT_DNA_VERSION)
  })
})
