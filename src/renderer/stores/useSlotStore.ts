import { create } from 'zustand'
import type { SlotDefinition } from '../../shared/types/slot'

interface SlotState {
  slots: SlotDefinition[]
  loading: boolean
  error: string | null
  loadSlots: () => Promise<void>
  getSlotById: (id: string) => SlotDefinition | undefined
  getSlotsByLayer: (layer: number) => SlotDefinition[]
}

export const useSlotStore = create<SlotState>((set, get) => ({
  slots: [],
  loading: false,
  error: null,

  loadSlots: async () => {
    set({ loading: true, error: null })
    try {
      const slots = await window.electronAPI.slot.listAll()
      set({ slots, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  getSlotById: (id) => {
    return get().slots.find((s) => s.id === id)
  },

  getSlotsByLayer: (layer) => {
    return get().slots.filter((s) => s.layer === layer)
  }
}))
