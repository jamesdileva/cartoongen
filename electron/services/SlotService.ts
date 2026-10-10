// Bundled slots ship inside the app bundle (static import works in dev
// and in the asar-packed build; fs reads of src/ do not survive packing).
import slotsData from '../../src/shared/data/slots.json'
import type { SlotDefinition } from '../../src/shared/types/slot'

let defaultSlots: SlotDefinition[] | null = null

function loadDefaultSlots(): SlotDefinition[] {
  if (defaultSlots) return defaultSlots

  defaultSlots = slotsData as SlotDefinition[]
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
