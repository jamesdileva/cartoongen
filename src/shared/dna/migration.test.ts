import { describe, it, expect } from 'vitest'
import { migrateDNA } from './migration'
import { createDNA } from './mutations'

describe('migrateDNA', () => {
  it('returns the same object for version 1', () => {
    const dna = createDNA('Test')
    const result = migrateDNA(dna)
    expect(result).toBe(dna)
  })
})
