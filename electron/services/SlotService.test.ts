import { describe, it, expect } from 'vitest'
import { SlotService } from './SlotService'

describe('SlotService', () => {
  it('loads all slot definitions', () => {
    const slots = SlotService.getAll()
    expect(slots.length).toBeGreaterThan(5)
    expect(slots.some((s) => s.id === 'hair')).toBe(true)
    expect(slots.some((s) => s.id === 'helmet')).toBe(true)
    expect(slots.some((s) => s.id === 'shirt')).toBe(true)
  })

  it('gets slot by id', () => {
    const hair = SlotService.getById('hair')
    expect(hair).toBeDefined()
    expect(hair!.label).toBe('Hair')
    expect(hair!.boneAttachment).toBe('Head')
    expect(hair!.maxAssets).toBe(1)
  })

  it('returns undefined for unknown id', () => {
    const result = SlotService.getById('nonexistent')
    expect(result).toBeUndefined()
  })

  it('returns slots sorted by layer', () => {
    const sorted = SlotService.getAllSortedByLayer()
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].layer).toBeGreaterThanOrEqual(sorted[i - 1].layer)
    }
  })

  it('filters slots by layer', () => {
    const layer5 = SlotService.getByLayer(5)
    expect(layer5.length).toBeGreaterThan(0)
    expect(layer5.every((s) => s.layer === 5)).toBe(true)
  })

  it('includes expected fields for every slot', () => {
    const slots = SlotService.getAll()
    for (const slot of slots) {
      expect(slot.id).toBeTruthy()
      expect(slot.label).toBeTruthy()
      expect(slot.boneAttachment).toBeTruthy()
      expect(typeof slot.layer).toBe('number')
      expect(Array.isArray(slot.allowedTags)).toBe(true)
      expect(typeof slot.maxAssets).toBe('number')
    }
  })
})
