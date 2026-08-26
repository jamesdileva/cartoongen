import { create } from 'zustand'
import type { AssetEntry, AssetQuery } from '../../shared/types/asset'

interface AssetState {
  assets: AssetEntry[]
  loading: boolean
  error: string | null

  queryAssets: (filters?: AssetQuery) => Promise<void>
  getBySlot: (slotId: string) => AssetEntry[]
}

export const useAssetStore = create<AssetState>((set, get) => ({
  assets: [],
  loading: false,
  error: null,

  queryAssets: async (filters) => {
    set({ loading: true, error: null })
    try {
      const results = await window.electronAPI.asset.query(filters)
      set({ assets: results, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  getBySlot: (slotId) => {
    return get().assets.filter((a) => a.slotId === slotId)
  }
}))
