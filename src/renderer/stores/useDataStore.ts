import { create } from 'zustand'
import type { Preset } from '../../shared/types/preset'

interface DataStoreState {
  presets: Preset[]
  palettes: Record<string, { default: string; colors: string[] }>
  loading: boolean
  error: string | null

  loadAll: () => Promise<void>
}

export const useDataStore = create<DataStoreState>((set) => ({
  presets: [],
  palettes: {},
  loading: false,
  error: null,

  loadAll: async () => {
    set({ loading: true, error: null })
    try {
      const [presets, palettes] = await Promise.all([
        window.electronAPI.data.getPresets(),
        window.electronAPI.data.getPalettes()
      ])
      set({ presets, palettes, loading: false, error: null })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  }
}))
