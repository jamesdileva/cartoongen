import { describe, it, expect } from 'vitest'
import slots from './slots.json'
import rules from './rules.json'
import presets from './presets.json'
import templates from './templates.json'
import exportProfiles from './export-profiles.json'
import referenceSkeleton from './reference-skeleton.json'

describe('slots.json', () => {
  it('has at least 10 slot definitions', () => {
    expect(slots.length).toBeGreaterThanOrEqual(10)
  })

  it('every slot has required fields', () => {
    for (const slot of slots) {
      expect(slot).toHaveProperty('id')
      expect(slot).toHaveProperty('label')
      expect(slot).toHaveProperty('boneAttachment')
      expect(typeof slot.layer).toBe('number')
      expect(Array.isArray(slot.allowedTags)).toBe(true)
    }
  })

  it('has unique slot IDs', () => {
    const ids = slots.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('each boneAttachment resolves via aliases, prefix, or special case', () => {
    const ref = referenceSkeleton as { critical: string[]; optional: string[]; aliases: Record<string, string> }
    const allBones = new Set([...ref.critical, ...ref.optional, ...Object.keys(ref.aliases)])
    const specialCases = new Set(['Hip', 'Foot', 'Hand'])
    for (const slot of slots) {
      const name = slot.boneAttachment
      if (allBones.has(name)) continue
      if (specialCases.has(name)) continue
      const leftRight = allBones.has(`Left${name}`) || allBones.has(`Right${name}`)
      const aliasMatch = Object.values(ref.aliases).includes(name)
      expect(leftRight || aliasMatch).toBe(true)
    }
  })
})

describe('rules.json', () => {
  it('has at least 3 rules', () => {
    expect(rules.length).toBeGreaterThanOrEqual(3)
  })

  it('every rule has trigger and actions', () => {
    for (const rule of rules) {
      expect(rule).toHaveProperty('trigger')
      expect(Array.isArray(rule.actions)).toBe(true)
      expect(rule.actions.length).toBeGreaterThan(0)
    }
  })

  it('every rule has a trigger.slotId if no trigger.tag', () => {
    for (const rule of rules) {
      if (!rule.trigger.tag) {
        expect(rule.trigger).toHaveProperty('slotId')
      }
    }
  })
})

describe('presets.json', () => {
  it('has at least 3 presets', () => {
    expect(presets.length).toBeGreaterThanOrEqual(3)
  })

  it('every preset has required fields', () => {
    for (const preset of presets) {
      expect(preset).toHaveProperty('id')
      expect(preset).toHaveProperty('name')
      expect(preset).toHaveProperty('description')
      expect(preset).toHaveProperty('icon')
    }
  })

  it('every preset has at least colors or morphs', () => {
    for (const preset of presets) {
      const hasColors = preset.colors && Object.keys(preset.colors).length > 0
      const hasMorphs = preset.morphs && Object.keys(preset.morphs).length > 0
      expect(hasColors || hasMorphs).toBe(true)
    }
  })
})

describe('templates.json', () => {
  it('has at least 3 templates', () => {
    expect(templates.length).toBeGreaterThanOrEqual(3)
  })

  it('every template has required fields', () => {
    for (const tmpl of templates) {
      expect(tmpl).toHaveProperty('id')
      expect(tmpl).toHaveProperty('name')
      expect(tmpl).toHaveProperty('description')
      expect(tmpl).toHaveProperty('icon')
      expect(tmpl).toHaveProperty('morphs')
      expect(tmpl).toHaveProperty('colors')
    }
  })
})

describe('export-profiles.json', () => {
  it('has at least 3 profiles', () => {
    expect(exportProfiles.length).toBeGreaterThanOrEqual(3)
  })

  it('every profile has required fields', () => {
    for (const profile of exportProfiles) {
      expect(profile).toHaveProperty('id')
      expect(profile).toHaveProperty('name')
      expect(profile).toHaveProperty('description')
      expect(typeof profile.binary).toBe('boolean')
      expect(typeof profile.embedImages).toBe('boolean')
    }
  })

  it('includes GLB Standard profile', () => {
    const ids = exportProfiles.map((p) => p.id)
    expect(ids).toContain('glb-standard')
  })
})

describe('reference-skeleton.json', () => {
  it('has critical and optional bone arrays', () => {
    const ref = referenceSkeleton as { critical: string[]; optional: string[]; aliases: Record<string, string> }
    expect(Array.isArray(ref.critical)).toBe(true)
    expect(ref.critical.length).toBeGreaterThanOrEqual(4)
    expect(Array.isArray(ref.optional)).toBe(true)
    expect(ref.optional.length).toBeGreaterThanOrEqual(4)
  })

  it('has hierarchy with parent-bone pairs', () => {
    const ref = referenceSkeleton as { hierarchy: Array<{ parent: string | null; bone: string }> }
    expect(Array.isArray(ref.hierarchy)).toBe(true)
    expect(ref.hierarchy.length).toBeGreaterThanOrEqual(5)
    for (const entry of ref.hierarchy) {
      expect(entry).toHaveProperty('bone')
    }
  })

  it('has aliases map with at least 10 entries', () => {
    const ref = referenceSkeleton as { aliases: Record<string, string> }
    expect(ref.aliases).toBeDefined()
    expect(Object.keys(ref.aliases).length).toBeGreaterThanOrEqual(10)
  })
})
