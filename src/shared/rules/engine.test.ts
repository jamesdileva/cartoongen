import { describe, it, expect } from 'vitest'
import { evaluateRules } from './engine'
import { createDNA, setSlot } from '../dna/mutations'
import type { Rule } from '../types/rule'

const helmetHidesHair: Rule = {
  id: 'helmet-hides-hair',
  trigger: { slotId: 'helmet' },
  actions: [{ type: 'hide_slot', target: 'hair' }]
}

const fullHelmetHidesFace: Rule = {
  id: 'full-helmet-hides-face',
  trigger: { slotId: 'helmet', tag: 'full_face' },
  actions: [
    { type: 'hide_slot', target: 'eyebrows' },
    { type: 'hide_slot', target: 'eyes' },
    { type: 'hide_slot', target: 'mouth' }
  ]
}

const tagResolver = (id: string) => {
  const tags: Record<string, string[]> = {
    helmet_full_01: ['helmet', 'full_face'],
    helmet_open_01: ['helmet', 'open_face'],
    helmet_knight_01: ['helmet', 'full_face', 'heavy']
  }
  return tags[id]
}

describe('evaluateRules', () => {
  it('returns empty results when no rules match', () => {
    const dna = createDNA('Test')
    const results = evaluateRules(dna, [helmetHidesHair])
    expect(results).toHaveLength(0)
  })

  it('returns empty results for empty rule set', () => {
    const dna = setSlot(createDNA('Test'), 'helmet', 'helmet_01')
    const results = evaluateRules(dna, [])
    expect(results).toHaveLength(0)
  })

  it('fires a rule when trigger slot is equipped', () => {
    const dna = setSlot(createDNA('Test'), 'helmet', 'helmet_01')
    const results = evaluateRules(dna, [helmetHidesHair])
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('hide')
    expect(results[0].slotId).toBe('hair')
  })

  it('does not fire when trigger slot is empty', () => {
    const dna = createDNA('Test')
    const results = evaluateRules(dna, [helmetHidesHair])
    expect(results).toHaveLength(0)
  })

  it('fires tag-based trigger with resolver', () => {
    const dna = setSlot(createDNA('Test'), 'helmet', 'helmet_full_01')
    const results = evaluateRules(dna, [fullHelmetHidesFace], tagResolver)
    expect(results).toHaveLength(3)
    expect(results.every((r) => r.type === 'hide')).toBe(true)
  })

  it('does not fire tag-based trigger without matching tag', () => {
    const dna = setSlot(createDNA('Test'), 'helmet', 'helmet_open_01')
    const results = evaluateRules(dna, [fullHelmetHidesFace], tagResolver)
    expect(results).toHaveLength(0)
  })

  it('does not fire tag-based trigger without resolver', () => {
    const dna = setSlot(createDNA('Test'), 'helmet', 'helmet_full_01')
    const results = evaluateRules(dna, [fullHelmetHidesFace])
    // Without resolver, tag check fails, no match
    expect(results).toHaveLength(0)
  })

  it('fires multiple rules independently', () => {
    const dna = setSlot(createDNA('Test'), 'helmet', 'helmet_full_01')
    const results = evaluateRules(dna, [helmetHidesHair, fullHelmetHidesFace], tagResolver)
    // helmetHidesHair produces 1 result, fullHelmetHidesFace produces 3 results
    expect(results).toHaveLength(4)
  })

  it('evaluates conditions with equipped: true', () => {
    const rule: Rule = {
      id: 'beard-with-helmet',
      trigger: { slotId: 'helmet' },
      conditions: [{ slotId: 'beard', equipped: true }],
      actions: [{ type: 'warn', message: 'Beard may clip' }]
    }

    const dna = setSlot(setSlot(createDNA('Test'), 'helmet', 'helmet_01'), 'beard', 'beard_long_01')
    const results = evaluateRules(dna, [rule])
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('warn')
  })

  it('does not fire when condition is not met', () => {
    const rule: Rule = {
      id: 'beard-with-helmet',
      trigger: { slotId: 'helmet' },
      conditions: [{ slotId: 'beard', equipped: true }],
      actions: [{ type: 'warn', message: 'Beard may clip' }]
    }

    const dna = setSlot(createDNA('Test'), 'helmet', 'helmet_01')
    // No beard equipped → condition fails → rule does not fire
    const results = evaluateRules(dna, [rule])
    expect(results).toHaveLength(0)
  })

  it('uses default rules from data file correctly', async () => {
    const rulesJson = await import('../data/rules.json')
    const rules = rulesJson.default as Rule[]

    // Helmet equipped, no beard → no rules fire without full_face tag
    const dna = setSlot(createDNA('Test'), 'helmet', 'helmet_open_01')
    const results = evaluateRules(dna, rules, tagResolver)

    expect(results).toHaveLength(0)
  })

  it('produces warn results correctly', () => {
    const warnRule: Rule = {
      id: 'test-warn',
      trigger: { slotId: 'helmet' },
      actions: [{ type: 'warn', message: 'Test warning' }]
    }

    const dna = setSlot(createDNA('Test'), 'helmet', 'helmet_01')
    const results = evaluateRules(dna, [warnRule])
    expect(results[0].type).toBe('warn')
    expect(results[0].message).toBe('Test warning')
  })
})
