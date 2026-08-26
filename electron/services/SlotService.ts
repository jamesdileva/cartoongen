import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SlotDefinition } from '../../src/shared/types/slot'

let defaultSlots: SlotDefinition[] | null = null

function loadDefaultSlots(): SlotDefinition[] {
  if (defaultSlots) return defaultSlots

  const filePath = join(__dirname, '../../src/shared/data/slots.json')
  const raw = readFileSync(filePath, 'utf-8')
  defaultSlots = JSON.parse(raw) as SlotDefinition[]
  return defaultSlots
}

export class SlotService {
  static getAll(): SlotDefinition[] {
    return loadDefaultSlots()
  }

  static getById(id: string): SlotDefinition | undefined {
    return loadDefaultSlots().find((s) => s.id === id)
  }

  static getByLayer(layer: number): SlotDefinition[] {
    return loadDefaultSlots().filter((s) => s.layer === layer)
  }

  static getAllSortedByLayer(): SlotDefinition[] {
    return [...loadDefaultSlots()].sort((a, b) => a.layer - b.layer)
  }
}
